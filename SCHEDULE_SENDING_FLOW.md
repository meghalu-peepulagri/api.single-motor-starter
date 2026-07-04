# Schedule Sending Flow

## Core Constraints

| Constraint | Value |
|---|---|
| Device slots | 1–15 (max 15 schedules on device at once) |
| Send window | today → today+2 (calendar days, IST) |
| Retry attempts | 3 |
| Retry wait times | [10s, 10s, 3s] |
| Max items per MQTT chunk | 8 |
| Packet type | `T: 3` (SCHEDULE CREATION) |

---

## Slot Lifecycle

```
FREE  (1–15, not assigned to any active schedule)
  │
  │  syncPendingSchedulesForStarter assigns free slot
  ▼
ASSIGNED — device_schedule_id set, ack = 0, status = PENDING
  │
  │  MQTT ACK received from device
  ▼
ACTIVE — acknowledgement = 1, status = SCHEDULED / RUNNING
  │
  ├── user deletes schedule          → slot FREE immediately
  ├── schedule end_date < today      → expired → slot FREE (on next sync)
  └── user stops schedule            → slot FREE (reusable)
```

---

## 4 Triggers

All triggers funnel into a single shared function:
`syncPendingSchedulesForStarter(starterId)`

```
┌─────────────────────────────────────────────────────────────────┐
│  Trigger 1 — POST /schedules (user creates schedule)           │
│  Trigger 2 — MQTT Heartbeat (device comes online)              │
│  Trigger 3 — Cron at 22:00 IST (pre-load next-day schedules)  │
│  Trigger 4 — Cron at 00:15 IST (advance window after midnight) │
│  Trigger 5 — POST /motor-schedules/bulk/republish (manual)     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
               syncPendingSchedulesForStarter(starterId)
```

---

## Core Function: `syncPendingSchedulesForStarter`

```
syncPendingSchedulesForStarter(starterId)
         │
         ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 1 — Expire old schedules                            │
 │                                                           │
 │  SELECT WHERE starter_id = X                            │
 │    AND end_date < today                                  │
 │    AND status != ARCHIVED                                │
 │    AND schedule_status NOT IN (DELETED, FAILED)          │
 │                                                           │
 │  → UPDATE schedule_status = DELETED                      │
 │  → their device_schedule_ids (1–15) are now FREE         │
 └───────────────────┬───────────────────────────────────────┘
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 2 — Compute free slots                              │
 │                                                           │
 │  usedSlots = SELECT device_schedule_id                  │
 │    WHERE starter_id = X                                  │
 │    AND acknowledgement = 1                               │
 │    AND status != ARCHIVED                                │
 │    AND schedule_status NOT IN (DELETED, FAILED)          │
 │    AND end_date >= today                                 │
 │                                                           │
 │  freeSlots = [1..15] minus usedSlots                     │
 └───────────────────┬───────────────────────────────────────┘
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 3 — Find PENDING schedules                          │
 │                                                           │
 │  Primary window (3-day):                                 │
 │    start_date >= today                                   │
 │    start_date <= today+2  ← applied by caller           │
 │    acknowledgement = 0                                   │
 │    schedule_status = PENDING                             │
 │                                                           │
 │  Late-start tolerance (cross-midnight recovery):         │
 │    start_date = yesterday                                │
 │    end_date >= today   ← schedule crosses midnight,      │
 │                          may still be running            │
 │    acknowledgement = 0                                   │
 │    schedule_status = PENDING                             │
 │                                                           │
 │  Implemented as OR in findPendingSchedulesForStarter:    │
 │    gte(start_date, today)                                │
 │    OR (start_date = yesterday AND end_date >= today)     │
 │                                                           │
 │  ORDER BY start_date ASC, schedule_id ASC               │
 └───────────────────┬───────────────────────────────────────┘
                     │
                     ├── 0 records ──→ DONE
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 4 — Assign free slots                               │
 │                                                           │
 │  Query takenSlots: all OTHER active records for this     │
 │  starter (not in incoming batch, not DELETED/FAILED)     │
 │                                                           │
 │  Pre-claim slots on incoming records that already have   │
 │  device_schedule_id (from a prior failed attempt)        │
 │                                                           │
 │  For each record WITHOUT device_schedule_id:             │
 │    pick lowest free slot from [1..15]                    │
 │    SET device_schedule_id = slot (only if still null)    │
 │    (skip record if no free slots — all 15 occupied)      │
 │                                                           │
 │  SAFETY: ack=1 slots are in takenSlots → never reused   │
 │  → device's running/scheduled schedules never replaced   │
 │                                                           │
 │  Drop records with no slot assigned before publish       │
 └───────────────────┬───────────────────────────────────────┘
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 5 — Build MQTT payload chunks                       │
 │                                                           │
 │  buildDeviceSyncPayloads(records)                        │
 │  → group by starter_id                                   │
 │  → split into chunks of max 8 items                      │
 │  → each item uses device_schedule_id (1–15) as slot id   │
 │                                                           │
 │  Payload shape per chunk:                                │
 │  {                                                        │
 │    T: 3,                                                 │
 │    S: <sequence_number>,                                 │
 │    D: {                                                   │
 │      idx: <chunk_index>,                                 │
 │      last: <0|1>,                                        │
 │      sch_cnt: <total_schedules>,                         │
 │      plr: <power_loss_recovery_time>,                    │
 │      m1: [{ id, sd, ed, st, et, st_ep, ed_ep, ... }]    │
 │    }                                                      │
 │  }                                                        │
 └───────────────────┬───────────────────────────────────────┘
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 6 — Re-verify still PENDING before publish          │
 │                                                           │
 │  Re-query DB for records still with ack=0                │
 │  (concurrent heartbeat may have already ACKed them)      │
 │  Skip chunk if all already acknowledged                  │
 └───────────────────┬───────────────────────────────────────┘
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 7 — Publish with retry  (publishingMap lock)        │
 │                                                           │
 │  Attempt 1: publish → wait 10s for ACK                  │
 │    ACK received ──────────────────────────────→ STEP 8  │
 │    Timeout ↓                                             │
 │  Attempt 2: publish → wait 10s for ACK                  │
 │    ACK received ──────────────────────────────→ STEP 8  │
 │    Timeout ↓                                             │
 │  Attempt 3: publish → wait  3s for ACK                  │
 │    ACK received ──────────────────────────────→ STEP 8  │
 │    Timeout ↓                                             │
 │                                                           │
 │  ALL 3 FAILED                                            │
 │  → records stay PENDING (device_schedule_id retained)   │
 │  → next heartbeat or cron will retry                    │
 └───────────────────┬───────────────────────────────────────┘
                     │
                 ACK received
                     │
                     ▼
 ┌───────────────────────────────────────────────────────────┐
 │ STEP 8 — Handle partial ACK + mark SCHEDULED             │
 │                                                           │
 │  Device may ACK only a subset (T:33 partial response)   │
 │  schedulePartialAckMap.get(publishKey) → confirmed IDs  │
 │                                                           │
 │  If partial ACK:                                         │
 │    only update rows whose schedule_id is in confirmed   │
 │    unconfirmed rows stay PENDING → retry next heartbeat  │
 │                                                           │
 │  If full ACK:                                            │
 │    update all sent rows                                  │
 │                                                           │
 │  UPDATE motor_schedules SET                              │
 │    acknowledgement = 1                                   │
 │    schedule_status = 'SCHEDULED'                         │
 │    acknowledged_at = now()                               │
 │  WHERE id IN (confirmed_db_ids)                          │
 └───────────────────────────────────────────────────────────┘
```

---

## Trigger 1 — On Schedule Create

```
POST /schedules
      │
      ▼
  Validate + conflict check
      │
      ▼
  Insert to DB
    schedule_status = PENDING
    acknowledgement = 0
    device_schedule_id = null
      │
      ▼
  Return 201 to client immediately
      │
      ▼  (background — do NOT await)
  Is schedule_start_date within [today, today+2] ?
      │
      ├── NO (future date) ──→ skip
      │                         cron will handle when window arrives
      │
      └── YES ──→ syncPendingSchedulesForStarter(starterId)
                  runs in background, non-blocking
```

---

## Trigger 2 — On Device Heartbeat

```
MQTT inbound: peepul/<MAC>/status  { T: HEART_BEAT }
                    │
                    ▼
         heartbeatHandler() [mqtt-db-services.ts]
                    │
                    ├── UPDATE signal_quality, is_online, last_seen
                    │
                    └── Fire background (do NOT await):
                        syncPendingSchedulesForStarter(starterId)
```

This covers:
- Device was offline, comes back online → immediately sends all pending
- Device online continuously → picks up newly created schedules on next heartbeat
- Window rolls over at midnight → next heartbeat picks up new day's schedules

---

## Trigger 3 — Cron at 22:00 IST

```
Purpose: pre-load tomorrow's early-morning schedules
         (00:30, 01:00, 02:00 etc) BEFORE midnight

Runs: daily at 22:00 IST

Logic:
  SELECT DISTINCT starter_id
  FROM motor_schedules
  WHERE schedule_status = PENDING
    AND acknowledgement = 0
    AND start_date <= today+2

  For each starterId:
    device online? (signal_quality BETWEEN 1 AND 30)
      YES → syncPendingSchedulesForStarter(starterId)
      NO  → skip (heartbeat handles when online)
```

Why 22:00 and not midnight:
- Tomorrow's 00:30 schedule needs to be on device BEFORE midnight
- Running at 22:00 gives 2-hour buffer
- At 22:00, today+1 is tomorrow → already in 3-day window → gets loaded

---

## Trigger 4 — Cron at 00:15 IST

```
Purpose: advance window for devices that came online after midnight
         and missed the 22:00 cron

Runs: daily at 00:15 IST

Logic: same as 22:00 cron
  SELECT DISTINCT starter_id
  FROM motor_schedules
  WHERE schedule_status = PENDING
    AND acknowledgement = 0
    AND start_date >= today   ← today is now the new day
    AND start_date <= today+2

  For each starterId:
    device online? → syncPendingSchedulesForStarter(starterId)
```

---

## Midnight Boundary — Cross-Day Schedules

Schedule that crosses midnight: start 23:30, end 02:00

```
CORRECT storage:
  schedule_start_date = Day N
  start_time          = 2330
  schedule_end_date   = Day N+1    ← must be +1 day
  end_time            = 0200

WHY this matters for slot cleanup:
  Cron at 00:15 on Day N+1:
    findAndDeleteExpiredSchedules: end_date < today?
    end_date = Day N+1 = today → NOT expired → slot stays OCCUPIED ✓

  If end_date was stored as Day N:
    end_date < today → marked DELETED at 00:15 → slot freed prematurely
    but device is still RUNNING the schedule → data inconsistency ✗

RULE: On create, if end_time < start_time → schedule_end_date = start_date + 1
```

---

## Late-Start Tolerance (cross-midnight recovery)

```
Scenario 1 — device offline, comes back BEFORE midnight:
  Schedule: start_date = Day N, start_time = 23:30, end_date = Day N
  Device offline 22:00 → back online 23:45
  Heartbeat fires → start_date = Day N = today → in normal window → sent ✓

Scenario 2 — device offline, comes back AFTER midnight (cross-midnight schedule):
  Schedule: start_date = Day N, start_time = 23:30
            end_date = Day N+1, end_time = 02:00  ← crosses midnight
  Device offline 23:00 → back online 00:20 on Day N+1

  Standard window: start_date >= today → Day N < Day N+1 → FILTERED OUT ✗

  Late-start tolerance (implemented in findPendingSchedulesForStarter):
    OR (start_date = yesterday AND end_date >= today)
    → start_date = Day N = yesterday ✓
    → end_date = Day N+1 = today ✓
    → INCLUDED → device gets schedule → runs until 02:00 ✓

Scenario 3 — same-day schedule, device comes back after midnight:
  Schedule: start_date = Day N, start_time = 23:30
            end_date = Day N (same day), end_time = 23:59
  Device offline → back online 00:20 Day N+1

  Late-start tolerance:
    end_date = Day N < today (Day N+1) → NOT included
    → schedule truly missed → correct ✓
    (single-day schedule that already ended)

Rule: cross-midnight schedules MUST be stored with end_date = start_date + 1
      otherwise late-start tolerance cannot recover them.
```

---

## Trigger 5 — Manual Republish

```
POST /{v}/motor-schedules/bulk/republish
Body: { "starter_id": 5, "ids": [1, 2, 3] }   (ids is optional)

         │
         ▼
  Validate starter_id
         │
         ├── starter offline → 200 DEVICE_OFFLINE (no-op, heartbeat will retry)
         │
         ▼
  ids provided?
    YES → UPDATE motor_schedules
          SET schedule_status = 'PENDING', acknowledgement = 0
          WHERE id IN (ids)
            AND starter_id = X
            AND schedule_status IN ('FAILED', 'PENDING')   ← resets both; skips STOPPED/DELETED
            AND status != 'ARCHIVED'
         │
         ▼
  pushPendingSchedulesForStarter(starter)
  → same full flow as Trigger 1/2/3/4
  → picks up reset FAILED + any already-PENDING records
  → returns { chunks, acked }
```

Cases handled:
- Stuck PENDING (never delivered): reset ack=0 + status=PENDING → picked up by sync
- FAILED (3 retries exhausted): reset to PENDING → picked up by sync
- No ids: sync all current PENDING for starter (same as heartbeat)
- Device offline: returns immediately; heartbeat delivers when online

---

## Device Slot Diagram (15 slots)

```
Starter X — device slots at a point in time:

Slot  │ schedule_id │ start_date │ start_time │ status
──────┼─────────────┼────────────┼────────────┼───────────
  1   │     101     │  260612    │   0600     │ SCHEDULED
  2   │     102     │  260612    │   1400     │ SCHEDULED
  3   │     103     │  260613    │   0800     │ SCHEDULED
  4   │     104     │  260613    │   2330     │ SCHEDULED
  5   │     105     │  260614    │   0030     │ SCHEDULED  ← pre-loaded by 22:00 cron
  6   │      —      │    —       │    —       │ FREE
  7   │      —      │    —       │    —       │ FREE
 ...  │     ...     │    ...     │    ...     │ ...
 15   │      —      │    —       │    —       │ FREE

When slot 1 expires (today > 260612):
  → slot 1 becomes FREE
  → next pending schedule gets assigned slot 1
```

---

## What Needs to Change in Code

| File | Change | Status |
|---|---|---|
| `motor-schedules-services.ts` | `MAX_DEVICE_CAPACITY = 64` → `15` | ✅ Done |
| `schedule-sync-helper.ts` | Remove `findMaxAckedEndDatePerStarter` guard. Fix slot assignment to use free-slot algorithm (never reuse ack=1 slots) | ✅ Done |
| `motor-scheduling-handlers.ts` `createMotorScheduleHandler` | After insert, fire `triggerSyncForCreatedSchedules` in background | ✅ Done |
| `mqtt-db-services.ts` `heartbeatHandler` | Background call to `pushPendingSchedulesForStarter` on heartbeat | ✅ Already existed |
| `motor-schedules-services.ts` `findPendingSchedulesForStarter` | Late-start tolerance: OR (start_date = yesterday AND end_date >= today) | ✅ Done |
| `routes/cron-routes.ts` | New public POST endpoints for Upstash crons | ✅ Done |
| `routes/index-routes.ts` | Register `/crons` route | ✅ Done |
| `motor-scheduling-handlers.ts` `bulkRepublishSchedulesHandler` | Reset FAILED → PENDING for given ids, then call `pushPendingSchedulesForStarter` | ✅ Done |
| `bulkCreateMotorSchedules` | Enforce `schedule_end_date = start_date + 1` when `end_time < start_time` | ⬜ Pending |

---

## Single Source of Truth

> `syncPendingSchedulesForStarter(starterId)` is the **only** function that assigns slots,
> builds payloads, publishes, and marks schedules as SCHEDULED.
> All 4 triggers call this function. No publish logic lives anywhere else.
