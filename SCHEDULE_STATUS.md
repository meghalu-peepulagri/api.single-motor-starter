# Schedule Status Reference

## All Statuses

| Status | Meaning | How It Gets Set |
|---|---|---|
| `PENDING` | Created, not yet sent to device | Insert on create; reset by republish |
| `SCHEDULED` | Device received & acknowledged schedule | Device sends `SCHEDULING_ACK` (ack=1) |
| `RUNNING` | Motor actually running this schedule | Device sends `LIVE_DATA` with `actual_start_time` + window open |
| `STOPPED` | User manually stopped | User calls stop API |
| `RESTARTED` | Was STOPPED, user restarted | User calls restart API |
| `WAITING_NEXT_CYCLE` | Ran today, waiting for next repeat day | Window passed + repeat range has future days remaining |
| `COMPLETED` | Ran full planned duration | `actual_run_time >= planned_duration` + window passed |
| `PARTIAL` | Motor ran but less than planned duration | Window passed + `actual_run_time < planned_duration` |
| `MISSED` | Device never started motor in window | Window passed + `actual_start_time` is null |
| `FAILED` | 3 MQTT retries exhausted, never delivered | 3 publish attempts timed out, `acknowledgement = 0` |
| `UNDELIVERED` | Device not reachable at delivery time | Set in specific delivery failure paths |
| `DELETED` | User deleted schedule | Soft delete — also sets `status = ARCHIVED` |

---

## Active vs Terminal

```
ACTIVE — can still transition:
  PENDING, SCHEDULED, RUNNING, STOPPED, RESTARTED, WAITING_NEXT_CYCLE

TERMINAL — no further transitions:
  COMPLETED, MISSED, PARTIAL, FAILED, DELETED, UNDELIVERED
```

---

## Status Transition Logic

All evaluation logic lives in `helpers/schedule-status-evaluator.ts`.

```
PENDING
  → SCHEDULED         device ACKs (SCHEDULING_ACK)
  → RUNNING           actual_start_time set + window open
  → WAITING_NEXT_CYCLE actual_start_time set + window passed + repeat days remain
  → COMPLETED         window passed + actual_run_time >= planned_duration
  → PARTIAL           window passed + actual_run_time < planned_duration
  → MISSED            window passed + actual_start_time is null + ack=1
  → FAILED            window passed + actual_start_time is null + ack=0 (3 retries exhausted)

SCHEDULED
  → RUNNING           device sends LIVE_DATA with actual_start_time + window open

RUNNING
  → SCHEDULED         window not yet open (self-heal: premature flip correction)
  → WAITING_NEXT_CYCLE window passed + repeat days remain
  → COMPLETED         window passed + actual_run_time >= planned_duration
  → PARTIAL           window passed + actual_run_time < planned_duration
  → STOPPED           user manually stops

STOPPED
  → SCHEDULED         user restarts (sets manually_stopped=false, enabled=true)

PARTIAL
  → RUNNING           window still open (self-heal correction)
  → COMPLETED         window closed + actual_run_time >= planned_duration

WAITING_NEXT_CYCLE
  → RUNNING           new cycle date + actual_start_time set + window open
  → COMPLETED/PARTIAL/MISSED  end_date exceeded → resolveTerminalStatus()
```

### Terminal Resolution (`resolveTerminalStatus`)

```
actual_start_time is null       → MISSED
actual_run_time >= planned_duration → COMPLETED
otherwise                       → PARTIAL
```

---

## Operation Rules

### What Code Currently Enforces

| Operation | Allowed On | Blocked On |
|---|---|---|
| **Delete** | ANY status | — (no status guard) |
| **Update** | ANY status | — (no status guard) |
| **Stop** | ANY status | — (no status guard) |
| **Restart** | `STOPPED` only | All others (implicit, no explicit error) |
| **Republish** | `PENDING`, `FAILED` | All others (explicit check enforced) |

### What Should Be Enforced (constants defined, not yet guarded)

| Operation | Should Allow | Should Block |
|---|---|---|
| **Update/Edit** | `PENDING`, `SCHEDULED`, `STOPPED` | `RUNNING`, `WAITING_NEXT_CYCLE`, terminal statuses |
| **Delete** | `PENDING`, `SCHEDULED`, `STOPPED`, terminal | `RUNNING` |
| **Stop** | `SCHEDULED`, `RUNNING`, `RESTARTED` | `PENDING`, `STOPPED`, terminal |
| **Restart** | `STOPPED` | All others |
| **Republish** | `PENDING`, `FAILED` | All others |

Constants already defined in `app-constants.ts`:
```
CANNOT_EDIT_RUNNING_SCHEDULE
CANNOT_DELETE_RUNNING_SCHEDULE
CANNOT_STOP_SCHEDULE   — "Only SCHEDULED, RUNNING, or RESTARTED schedules can be stopped"
CANNOT_RESTART_SCHEDULE — "Only STOPPED schedules can be restarted"
```

---

## Key DB Fields

| Field | Type | Set By | Purpose |
|---|---|---|---|
| `schedule_status` | ENUM | Evaluation logic / handlers | Current status |
| `acknowledgement` | INT (0/1) | `SCHEDULING_ACK` packet | 0 = not delivered, 1 = device confirmed |
| `actual_start_time` | VARCHAR (HH:MM) | `LIVE_DATA` MQTT packet | Time device actually started motor |
| `actual_end_time` | VARCHAR | `LIVE_DATA` MQTT packet | Time device actually stopped motor |
| `actual_run_time` | INT (seconds) | Computed from live data | Used to determine COMPLETED vs PARTIAL |
| `last_started_at` | TIMESTAMP | Evaluation on RUNNING flip | Server time when status → RUNNING |
| `last_stopped_at` | TIMESTAMP | Evaluation on stop/cycle | Server time when window closed |
| `manually_stopped` | BOOL | Stop/restart handlers | Distinguishes manual stop from auto-complete |
| `enabled` | BOOL | Stop/restart handlers | false when STOPPED, true when active |

---

## Unique Constraint

Partial unique index on `(motor_id, schedule_id)` where:

```sql
status != 'ARCHIVED'
AND schedule_status NOT IN ('COMPLETED', 'MISSED', 'PARTIAL', 'FAILED', 'DELETED')
```

Terminal statuses allow same slot to be reused for same motor.

---

## Key Files

| File | Responsibility |
|---|---|
| `database/schemas/motor-schedules.ts` | Enum definition + DB schema |
| `helpers/schedule-status-evaluator.ts` | All status transition conditions |
| `services/db/motor-schedules-services.ts` | DB operations, `ACTIVE_STATUSES` constant |
| `handlers/motor-scheduling-handlers.ts` | Create / update / delete / stop / restart / republish |
| `helpers/schedule-sync-helper.ts` | Slot assignment + MQTT publish logic |
| `services/db/mqtt-db-services.ts` | Heartbeat, LIVE_DATA, SCHEDULING_ACK handlers |
