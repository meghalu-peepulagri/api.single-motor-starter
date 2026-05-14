# Motor Schedule — Design & Gap Analysis

## 1. Current DB State vs Schema File

Schema file (`src/database/schemas/motor-schedules.ts`) is **out of sync** with actual DB.
Many columns exist via migrations but are missing from the TS schema definition.

### Columns in DB but missing from schema file

| Column | Type | Added in |
|--------|------|----------|
| `acknowledgement` | integer (0/1) | 0000 |
| `acknowledged_at` | timestamp | 0022 |
| `last_started_at` | timestamp | 0022 |
| `last_stopped_at` | timestamp | 0022 |
| `enabled` | boolean default true | 0022 |
| `repeat` | integer default 0 | 0021 |
| `priority` | integer default 2 | 0023 |
| `accumulated_on_seconds` | integer default 0 | 0021 |
| `manually_stopped` | boolean default false | 0021 |
| `actual_start_time` | varchar | 0033 |
| `actual_end_time` | varchar | 0033 |
| `actual_run_time` | integer | 0033 |
| `actual_type` | schedule_mode enum | 0033 |
| `missed_minutes` | integer default 0 | 0040 |
| `failure_at` | timestamp | 0040 |
| `failure_reason` | integer default 0 | 0040 |
| `paused_at` | timestamp | 0042 |
| `restarted_at` | timestamp | 0043 |
| `edited_at` | timestamp | 0051 |
| `completed_at` | timestamp | 0052 |

---

## 2. What's Missing for Full Use Case

### 2a. Per-operation ACK tracking — `motor_schedule_operations` table

Instead of 10 flat columns on `motor_schedules`, use a separate table.
One row per operation sent to device. Keeps the main table clean; supports multiple
resends (each resend = new row for the same operation type).

```sql
CREATE TABLE motor_schedule_operations (
  id           SERIAL PRIMARY KEY,
  schedule_id  INTEGER NOT NULL REFERENCES motor_schedules(id),
  operation    VARCHAR NOT NULL,   -- 'CREATE' | 'STOP' | 'RESTART' | 'DELETE'
  sent_at      TIMESTAMP,          -- when MQTT payload was published
  ack_at       TIMESTAMP,          -- when device ACKed
  ack_status   INTEGER DEFAULT 0,  -- 0=pending, 1=acked, 2=timeout
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

Index: `schedule_id`, `(schedule_id, operation)` for latest-per-type queries.

To get current pending operation for a schedule:
```sql
SELECT * FROM motor_schedule_operations
WHERE schedule_id = $1
ORDER BY created_at DESC
LIMIT 1;
```

To get latest op of a specific type:
```sql
SELECT * FROM motor_schedule_operations
WHERE schedule_id = $1 AND operation = 'STOP'
ORDER BY created_at DESC
LIMIT 1;
```

### 2b. Device live data snapshot (new columns on `motor_schedules`)

Latest state from device — overwritten on every 2-min live data packet for this schedule.
Separate from `actual_*` columns which are evaluator-tracked server-side values.

| Column | Type | Purpose |
|--------|------|---------|
| `device_start_time` | varchar (HHMM) | Actual time device started motor |
| `device_end_time` | varchar (HHMM) | Actual end time reported by device |
| `device_run_time` | integer (minutes) | Actual runtime device is executing |
| `device_missed_minutes` | integer default 0 | Accumulated missed/power-loss minutes |
| `device_failure_at` | timestamp | Last failure timestamp from device |
| `device_failure_reason` | varchar | Failure reason string from device |
| `device_last_seen_at` | timestamp | Last time live data arrived for this schedule |

### 2c. New table: `motor_schedule_live_data`

**One row per schedule** — upserted on every 2-min device report.
Holds the latest known execution state from the device.
Full historical log (all 2-min snapshots) is pushed to S3 separately.

```sql
CREATE TABLE motor_schedule_live_data (
  id                    SERIAL PRIMARY KEY,
  schedule_id           INTEGER NOT NULL UNIQUE REFERENCES motor_schedules(id),
  motor_id              INTEGER NOT NULL REFERENCES motors(id),
  starter_id            INTEGER REFERENCES starter_boxes(id),
  device_start_time     VARCHAR,        -- HHMM
  device_end_time       VARCHAR,        -- HHMM
  device_run_time       INTEGER,        -- minutes
  device_missed_minutes INTEGER DEFAULT 0,
  failure_reason        VARCHAR,
  s3_log_key            VARCHAR,        -- S3 object key for full history archive
  received_at           TIMESTAMP NOT NULL DEFAULT NOW(),  -- last upsert time
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);
```

On each live data packet: `INSERT ... ON CONFLICT (schedule_id) DO UPDATE SET ...`
S3 push: append raw packet to S3 object at `s3_log_key` (e.g. `schedules/{schedule_id}/live.jsonl`).

Index: `schedule_id` (unique)

### 2d. New table: `motor_schedule_logs`

Full lifecycle audit trail per schedule.
Every state change, MQTT dispatch, ACK, resend gets one row.

```sql
CREATE TABLE motor_schedule_logs (
  id           SERIAL PRIMARY KEY,
  schedule_id  INTEGER NOT NULL REFERENCES motor_schedules(id),
  event_type   schedule_log_event NOT NULL,  -- enum below
  actor_type   VARCHAR,  -- 'user' | 'device' | 'system'
  actor_id     INTEGER,  -- user_id if actor_type = 'user'
  old_status   VARCHAR,
  new_status   VARCHAR,
  details      JSONB,    -- free-form context (ack payload, error, etc.)
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Event type enum values:**
```
CREATED              -- Schedule row inserted
SENT_TO_DEVICE       -- MQTT create payload published
DEVICE_ACK_CREATE    -- Device acked create (SCHEDULING_ACK)
RESENT               -- Admin resent to device (pending retry)
STOP_SENT            -- Stop cmd published to device
DEVICE_ACK_STOP      -- Device acked stop
RESTART_SENT         -- Restart cmd published to device
DEVICE_ACK_RESTART   -- Device acked restart
DELETE_SENT          -- Delete cmd published to device
DEVICE_ACK_DELETE    -- Device acked delete
STATUS_CHANGED       -- Evaluator / sync changed schedule_status
LIVE_DATA_RECEIVED   -- 2-min live data snapshot arrived
```

Index: `schedule_id`, `created_at`

---

## 3. Status Definitions (Corrected)

| Status | Meaning |
|--------|---------|
| `PENDING` | Created, not yet sent OR sent but no ACK from device |
| `FAILED` | Sent to device, no ACK, schedule time window has passed |
| `SCHEDULED` | Device ACKed create, schedule is a future date/time |
| `RUNNING` | Device ACKed, currently inside time window, live data arriving |
| `STOPPED` | Device ACKed create, admin sent stop + device ACKed stop |
| `RESTARTED` | Was STOPPED, admin sent restart + device ACKed restart |
| `COMPLETED` | Window ended, device reported full planned runtime |
| `PARTIAL` | Window ended, device reported less than planned runtime |
| `MISSED` | Window ended, no live data arrived at all |
| `DELETED` | Admin sent delete (anytime), device ACKed OR forced-deleted |

---

## 4. Status Flow

```
Admin creates schedule
  → DB row: schedule_status = PENDING
  → Log: CREATED

Admin/system sends to device (MQTT publish)
  → create_sent_at = now()
  → Log: SENT_TO_DEVICE

  Case A: Device sends SCHEDULING_ACK
    → acknowledgement = 1, acknowledged_at = now()
    → If schedule date/time in future → SCHEDULED
    → If schedule window currently open → RUNNING
    → Log: DEVICE_ACK_CREATE

  Case B: No ACK, time window has passed
    → Evaluator marks → FAILED
    → Log: STATUS_CHANGED (PENDING → FAILED)
    → FAILED is terminal — no resend, no delete allowed

PENDING → Admin clicks Resend
  → Insert new row into motor_schedule_operations (operation=CREATE)
  → Re-publish MQTT
  → Log: RESENT
  → Wait for ACK again

SCHEDULED → time arrives
  → Evaluator marks → RUNNING
  → Log: STATUS_CHANGED

SCHEDULED / RUNNING → Admin clicks Stop
  → Insert row into motor_schedule_operations (operation=STOP)
  → Publish stop cmd
  → Log: STOP_SENT
  → Device ACKs → update op row: ack_at, ack_status=1 → STOPPED
  → Log: DEVICE_ACK_STOP + STATUS_CHANGED

RUNNING → Admin clicks Delete → BLOCKED (must stop first)

STOPPED → Admin clicks Restart
  → Insert row into motor_schedule_operations (operation=RESTART)
  → Publish restart cmd
  → Log: RESTART_SENT
  → Device ACKs → update op row: ack_at, ack_status=1 → RESTARTED
  → Re-evaluates to SCHEDULED or RUNNING based on current time
  → Log: DEVICE_ACK_RESTART + STATUS_CHANGED

RUNNING → Every 2 minutes (live data)
  → Upsert motor_schedule_live_data (1 row per schedule, overwrite)
  → Append raw packet to S3 (schedules/{schedule_id}/live.jsonl)
  → Update device_* snapshot columns on motor_schedules
  → Log: LIVE_DATA_RECEIVED (optional — high volume)

RUNNING → Window closes
  → Evaluator checks actual_run_time vs planned
  → actual_run_time >= planned → COMPLETED
  → actual_run_time < planned AND actual_start_time set → PARTIAL
  → actual_start_time null → MISSED
  → PARTIAL / MISSED / COMPLETED: view logs only, no delete, no restart
  → Log: STATUS_CHANGED

PENDING / SCHEDULED / STOPPED / RESTARTED → Admin clicks Delete
  → Insert row into motor_schedule_operations (operation=DELETE)
  → Publish delete cmd to device
  → Log: DELETE_SENT
  → Device ACKs → update op row: ack_at, ack_status=1 → DELETED
  → Log: DEVICE_ACK_DELETE + STATUS_CHANGED

RUNNING / PARTIAL / MISSED / COMPLETED / FAILED → Delete BLOCKED
```

---

## 5. Frontend Actions by Status

| Status | Allowed Actions | Notes |
|--------|----------------|-------|
| `PENDING` | Resend, Delete | Delete = soft-delete (never reached device) |
| `FAILED` | View Logs | Time passed without ACK — no resend, no delete |
| `SCHEDULED` | Stop, Delete | Delete sends delete cmd to device |
| `RUNNING` | Stop | Must stop first before delete is possible |
| `STOPPED` | Restart, Delete | Restart sends restart cmd |
| `RESTARTED` | Stop | Must stop first before delete is possible |
| `PARTIAL` | View Logs | No delete, no restart for now |
| `MISSED` | View Logs | No delete, no restart for now |
| `COMPLETED` | View Logs | Terminal state — no delete |
| `DELETED` | View Logs | Terminal state |

---

## 6. API Endpoints Needed

### Existing (already wired)
```
POST   /{v}/motor-schedules              create
GET    /{v}/motor-schedules              list with filters
GET    /{v}/motor-schedules/:id          single detail
PATCH  /{v}/motor-schedules/:id          edit (non-running only)
DELETE /{v}/motor-schedules/:id          delete
PATCH  /{v}/motor-schedules/:id/status   stop (cmd=1) / restart (cmd=2)
POST   /{v}/motor-schedules/:id/ack      update acknowledgement
POST   /{v}/motor-schedules/bulk/ack     bulk update acknowledgement
POST   /{v}/motor-schedules/pending/sync resend pending to device
GET    /{v}/motor-schedules/:id/history  schedule history
POST   /{v}/motor-schedules/sync         sync all evaluatable statuses
```

### New endpoints needed
```
GET    /{v}/motor-schedules/:id/logs        full lifecycle audit trail (paginated)
GET    /{v}/motor-schedules/:id/live-data   latest device snapshot (single record)
GET    /{v}/motor-schedules/:id/operations  all operation rows for a schedule
```

---

## 7. MQTT Handler Changes

### On SCHEDULING_ACK (create ack)
```
1. Find schedule by motor_id + schedule_id from payload
2. Set acknowledgement=1, acknowledged_at=now() on motor_schedules
3. Update latest CREATE row in motor_schedule_operations: ack_at=now(), ack_status=1
4. Determine new status: SCHEDULED (future) or RUNNING (window open)
5. Insert log: DEVICE_ACK_CREATE + STATUS_CHANGED
```

### On live data with schedule info (every 2 min)
```
1. Find schedule by motor_id + active schedule_id
2. Upsert motor_schedule_live_data (1 row, overwrite all device_* fields)
3. Update device_* snapshot columns on motor_schedules
4. Update actual_start_time / actual_run_time if device reports them
5. Append raw packet to S3: schedules/{schedule_id}/live.jsonl
6. Insert log: LIVE_DATA_RECEIVED (optional — high volume)
```

### On stop/restart/delete ACK
```
1. Find schedule by motor_id + schedule_id
2. Find latest operation row matching operation type in motor_schedule_operations
3. Update op row: ack_at=now(), ack_status=1
4. Update schedule_status on motor_schedules
5. Insert log: DEVICE_ACK_* + STATUS_CHANGED
```

---

## 8. Implementation Order

1. **Fix schema file** — add all ~20 missing columns to `motor-schedules.ts`
2. **Migration: device snapshot columns** — add `device_*` columns to `motor_schedules`
3. **Migration: new tables** — `motor_schedule_operations` + `motor_schedule_live_data` + `motor_schedule_logs`
4. **Handler: write operation row** — create/stop/restart/delete handlers insert into `motor_schedule_operations`
5. **Handler: enforce action guards** — block delete on RUNNING/PARTIAL/MISSED/COMPLETED/FAILED; block resend on FAILED
6. **Handler: write logs** — every operation inserts into `motor_schedule_logs`
7. **MQTT: ACK handlers** — update `motor_schedule_operations` row on SCHEDULING_ACK and other acks; write log
8. **MQTT: live data** — upsert `motor_schedule_live_data`; update `device_*` snapshot; push raw to S3
9. **New API endpoints** — `GET /:id/logs`, `GET /:id/live-data`
10. **Schema file sync** — regenerate types after all migrations applied
