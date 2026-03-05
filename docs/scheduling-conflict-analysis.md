# Pump Scheduling System - Conflict Analysis Document

**Project:** PeepulAgri Single Motor Starter API
**Date:** 2026-03-05
**Scope:** Identifying conflicts between the new scheduling specification and the existing codebase implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Conflict #1 — MQTT Schedule ACK Not Handled](#2-conflict-1--mqtt-schedule-ack-not-handled)
3. [Conflict #2 — Days Encoding Mismatch (Bitmask vs Array)](#3-conflict-2--days-encoding-mismatch-bitmask-vs-array)
4. [Conflict #3 — Cyclic Schedule Missing end_time in Device Protocol](#4-conflict-3--cyclic-schedule-missing-end_time-in-device-protocol)
5. [Conflict #4 — Schedule ID Range Mismatch (1–6 Limit vs Auto-Increment)](#5-conflict-4--schedule-id-range-mismatch-16-limit-vs-auto-increment)
6. [Conflict #5 — No MQTT Publish Logic for Schedule Commands](#6-conflict-5--no-mqtt-publish-logic-for-schedule-commands)
7. [Conflict #6 — Motor Mode (AUTO/MANUAL) Not Enforced During Scheduling](#7-conflict-6--motor-mode-automanual-not-enforced-during-scheduling)
8. [Conflict #7 — Manual Override Does Not Cancel Active Schedules](#8-conflict-7--manual-override-does-not-cancel-active-schedules)
9. [Conflict #8 — Power Loss Recovery Has No Runtime Logic](#9-conflict-8--power-loss-recovery-has-no-runtime-logic)
10. [Conflict #9 — One-Time vs Repeat Priority Not Implemented](#10-conflict-9--one-time-vs-repeat-priority-not-implemented)
11. [Conflict #10 — Midnight-Crossing Schedules: Day Mapping Issue](#11-conflict-10--midnight-crossing-schedules-day-mapping-issue)
12. [Conflict #11 — Repeat Field Semantics Inverted in Device Protocol](#12-conflict-11--repeat-field-semantics-inverted-in-device-protocol)
13. [Conflict #12 — No Scheduler Engine (Cron/Worker) to Trigger Schedules](#13-conflict-12--no-scheduler-engine-cronworker-to-trigger-schedules)
14. [Conflict #13 — Delete Handler Does Not Send MQTT Delete Command](#14-conflict-13--delete-handler-does-not-send-mqtt-delete-command)
15. [Conflict #14 — Notification System Has No Schedule-Related Notifications](#15-conflict-14--notification-system-has-no-schedule-related-notifications)
16. [Conflict #15 — Schedule Status vs Device ACK Status Mismatch](#16-conflict-15--schedule-status-vs-device-ack-status-mismatch)
17. [Summary Table](#17-summary-table)

---

## 1. Executive Summary

The existing codebase has the **database schema**, **API routes**, **validation**, and **conflict detection** logic for motor scheduling already in place. However, the implementation is currently **backend-only (CRUD layer)**. The device communication, execution engine, and real-time behavior required by the scheduling specification have **not been implemented yet**.

This document identifies **15 conflicts** across backend, device, and system behavior layers. Each conflict describes **what exists**, **what the specification requires**, **why the conflict occurs**, and **how to fix it**.

---

## 2. Conflict #1 — MQTT Schedule ACK Not Handled

### What Exists
- `packet-types-helper.ts` defines `SCHEDULING_ACK = 33` and `SCHEDULING_DATA_REQUEST_ACK = 37`
- `findTopicACKByType()` maps type `33` → `"SCHEDULING_ACK"` and `37` → `"SCHEDULING_DATA_REQUEST_ACK"`

### What Is Missing
- `selectTopicAck()` in `mqtt-db-services.ts` has **no case for `"SCHEDULING_ACK"`** or `"SCHEDULING_DATA_REQUEST_ACK"`
- Device sends `{ T: 54, S: 101, D: { sch_type, id, status } }` for schedule creation ACK — this is **silently dropped**

### Why It Conflicts
The specification requires the backend to receive device acknowledgement (success/failure/flash issue/invalid data) after sending a schedule command. Without handling these ACKs:
- Backend schedule_status stays at `PENDING` forever
- No feedback loop to mark schedule as `SCHEDULED`, `FAILED`, or `RUNNING`
- User never knows if the device accepted the schedule

### How to Fix

**Backend:**
- Add `case "SCHEDULING_ACK"` in `selectTopicAck()` → create a `schedulingAckHandler()`
- Parse `D.status` from the device payload:
  - `1` (Success) → Update `schedule_status` to `"SCHEDULED"`, set `acknowledgement = 1`, `acknowledged_at = now`
  - `0` (Failed) → Update `schedule_status` to `"FAILED"`
  - `2` (Flash Issue) → Update `schedule_status` to `"FAILED"`, log flash error
  - `3` (Invalid Data) → Update `schedule_status` to `"FAILED"`, log validation error
- Match the device ACK using `D.sch_type` + `D.id` → find the corresponding DB record by `motor_id` + `schedule_id`

**Device:**
- No change needed — device already sends the ACK. Backend must listen.

**System:**
- Add retry logic: if ACK not received within N seconds, resend the schedule command (with max retries)

---

## 3. Conflict #2 — Days Encoding Mismatch (Bitmask vs Array)

### What Exists
- **Database:** `days_of_week` is stored as `integer[]` (PostgreSQL array) — e.g., `[1, 3, 5]` for Mon/Wed/Fri
- **Backend API:** Accepts and returns `days_of_week` as an array `[0, 1, 2, 3, 4, 5, 6]`
- **Payload helper:** `decodeDaysMask()` converts bitmask → array during normalization

### What The Spec Requires
- **Device protocol:** `days` field is a **bitmask integer** — e.g., `62` = Mon(2)+Tue(4)+Wed(8)+Thu(16)+Fri(32)
  - Sunday = Bit 0 (value 1)
  - Monday = Bit 1 (value 2)
  - Saturday = Bit 6 (value 64)

### Why It Conflicts
When the backend needs to **publish** a schedule command to the device via MQTT, it must convert the stored array `[1,2,3,4,5]` back into bitmask `62`. Currently:
- `normalizeMotorSchedulePayload()` handles **incoming** conversion (bitmask → array) during API creation
- **No outgoing conversion exists** (array → bitmask) for MQTT publish
- If the backend sends `days: [1,2,3,4,5]` to the device, the device will not understand it

### How to Fix

**Backend:**
- Add an `encodeDaysMask(days: number[]): number` function:
  ```typescript
  function encodeDaysMask(days: number[]): number {
    return days.reduce((mask, day) => mask | (1 << day), 0);
  }
  ```
- Use this function when constructing MQTT publish payloads for the device
- Keep the database storage as `integer[]` (more readable for queries)

**Device:**
- No change needed — device expects bitmask format.

---

## 4. Conflict #3 — Cyclic Schedule Missing `end_time` in Device Protocol

### What Exists
- **Database schema:** `end_time` is a **required NOT NULL field** (`varchar("end_time").notNull()`)
- **Backend validation:** Both `start_time` and `end_time` are required for all schedule types
- **Payload helper:** If `end_time` is missing for CYCLIC, it defaults to `"23:59"`

### What The Spec Requires
- **Device protocol for Cyclic:** `{ sch_type: 2, id, start, on, off, rep, days, en }` — **no `end` field**
- Cyclic schedules run indefinitely in ON/OFF cycles until manually stopped or quota met

### Why It Conflicts
- Backend **forces** an `end_time` on cyclic schedules (defaults to `"23:59"`)
- The device does not accept or use `end_time` for cyclic mode
- Conflict detection uses `end_time` for overlap checking — but cyclic schedules may not have a natural end
- If a cyclic schedule starts at `22:00`, the default end of `23:59` would limit it to ~2 hours. The spec says cycles continue indefinitely

### How to Fix

**Backend:**
- Make `end_time` **nullable** for CYCLIC schedules in the schema (allow `NULL`)
- Update validation: `end_time` required only for `TIME_BASED` schedules
- For CYCLIC conflict detection, calculate effective end based on `runtime_minutes` (quota) if provided, otherwise treat as open-ended
- When publishing to device, **omit `end`** field for CYCLIC type payloads

**Device:**
- No change needed.

**System:**
- Update overlap detection to handle open-ended cyclic schedules — they conflict with any schedule that starts after them on the same day

---

## 5. Conflict #4 — Schedule ID Range Mismatch (1–6 Limit vs Auto-Increment)

### What Exists
- `getNextScheduleIdForMotor()` returns `MAX(schedule_id) + 1` — **unbounded auto-increment**
- No upper limit check: schedule_id can grow to 7, 8, 100, etc.

### What The Spec Requires
- `id`: Schedule Number **1 to 6** — device supports a maximum of 6 schedules per motor

### Why It Conflicts
- If a user creates and deletes schedules over time, `schedule_id` will exceed 6
- Device firmware only has memory slots for 6 schedules (IDs 1–6)
- Backend would send `id: 7` to device → device rejects with `status: 3` (Invalid Data) or ignores it
- No validation prevents creating a 7th schedule

### How to Fix

**Backend:**
- Add validation: reject schedule creation if motor already has 6 active schedules
- Change `getNextScheduleIdForMotor()` to find the **lowest available ID** (1–6) instead of auto-incrementing:
  ```typescript
  async function getNextScheduleIdForMotor(motorId: number): Promise<number> {
    const usedIds = await db.select({ id: motorSchedules.schedule_id })
      .from(motorSchedules)
      .where(and(
        eq(motorSchedules.motor_id, motorId),
        inArray(motorSchedules.schedule_status, ACTIVE_STATUSES)
      ));
    const used = new Set(usedIds.map(r => r.id));
    for (let i = 1; i <= 6; i++) {
      if (!used.has(i)) return i;
    }
    throw new BadRequestException("Maximum 6 schedules per motor reached");
  }
  ```

**Device:**
- No change needed — device already enforces 1–6.

**System:**
- Unique constraint `(motor_id, schedule_id)` already exists — ensures no duplicate IDs per motor

---

## 6. Conflict #5 — No MQTT Publish Logic for Schedule Commands

### What Exists
- MQTT service (`mqtt-service.ts`) only **subscribes** to `peepul/+/status` for incoming device messages
- Motor control commands are published via separate handler flows
- Schedule handlers (`motor-scheduling-handlers.ts`) only perform **database CRUD** — no MQTT publish

### What The Spec Requires
- **Create schedule** → Publish `{ T: 23, S: 42, D: { sch_type, id, start, end, dur, rep, days, pwr_rec, en } }`
- **Stop schedule** → Publish `{ T: 24, S: 120, D: { sch_type, id, cmd: 1 } }`
- **Restart schedule** → Publish `{ T: 24, S: 120, D: { sch_type, id, cmd: 2 } }`
- **Delete schedule** → Publish `{ T: 24, S: 120, D: { sch_type, id, cmd: 3 } }`

### Why It Conflicts
This is the **most critical gap**. The schedule is saved in the database but **never sent to the device**. The motor will never actually turn ON/OFF based on the schedule because the device is unaware of it.

### How to Fix

**Backend:**
- Create a `publishScheduleToDevice()` function that:
  1. Looks up the `starter_id` for the motor
  2. Resolves the MQTT topic: `peepul/{mac_address}/command` (or equivalent publish topic)
  3. Constructs the device payload with correct `T`, `S` values and field mappings
  4. Publishes via `mqttClient.publish()`
- Integrate into handlers:
  - `createMotorScheduleHandler` → After DB save, publish create command
  - `stopMotorScheduleHandler` → After DB update, publish stop command (cmd=1)
  - `restartMotorScheduleHandler` → After DB update, publish restart command (cmd=2)
  - `deleteMotorScheduleHandler` → After DB update, publish delete command (cmd=3)
- Handle offline devices: queue the command and send when device comes online (via heartbeat detection)

**Device:**
- No change needed — device already listens for these commands.

---

## 7. Conflict #6 — Motor Mode (AUTO/MANUAL) Not Enforced During Scheduling

### What Exists
- Motor schema has a `mode` field: `"MANUAL"` or `"AUTO"`
- Mode changes are tracked via MQTT ACK (`MODE_CHANGE_ACK`)
- Schedule creation does **not check** the current motor mode

### What The Spec Requires
- Schedules operate in **AUTO mode** only
- If motor is in **MANUAL mode**, scheduling should be suspended
- Manual override always has highest priority

### Why It Conflicts
- A user can create a schedule while the motor is in MANUAL mode → schedule is saved but device behavior is undefined
- No mode check during schedule creation or execution
- No automatic mode switch to AUTO when a schedule activates
- No automatic suspension of schedules when user switches to MANUAL

### How to Fix

**Backend:**
- During schedule creation:
  - Check motor mode — warn user if motor is in MANUAL mode (schedule will not execute until mode changes to AUTO)
  - OR reject schedule creation if mode is MANUAL (stricter approach)
- When `MODE_CHANGE_ACK` is received with mode = `"MANUAL"`:
  - Find all RUNNING schedules for that motor → update status to `"STOPPED"` with `manually_stopped = true`
  - Send stop command to device for any active schedule
- When `MODE_CHANGE_ACK` is received with mode = `"AUTO"`:
  - Do NOT auto-resume stopped schedules (per spec: "Schedule does NOT resume automatically")

**Device:**
- Device should reject schedule execution if in MANUAL mode (firmware level check).

**System:**
- Add notifications when schedules are suspended due to manual override

---

## 8. Conflict #7 — Manual Override Does Not Cancel Active Schedules

### What Exists
- `MOTOR_CONTROL_ACK` handler in `mqtt-db-services.ts` updates motor state and mode
- No cross-reference between motor control events and schedule state
- User can turn motor ON/OFF via manual control without affecting schedule records

### What The Spec Requires
- If user manually turns motor ON/OFF or switches to MANUAL mode:
  - Active schedule **stops immediately**
  - Schedule does NOT resume automatically
  - Scheduler logic is **suspended** while in Manual Mode

### Why It Conflicts
- A manual ON/OFF command executes independently of any running schedule
- Schedule status in DB remains `"RUNNING"` even after manual override
- When the schedule's end_time arrives, the system may try to turn OFF the motor (conflicting with user's manual ON)
- Creates unpredictable behavior: two control sources (manual + schedule) fighting

### How to Fix

**Backend:**
- In `motorControlAckHandler()` (motor ON/OFF ACK):
  - After updating motor state, check for any RUNNING schedules on this motor
  - If found and the control was manual (not from schedule):
    - Update schedule_status to `"STOPPED"`, set `manually_stopped = true`
    - Log the override event
- In `motorModeChangeAckHandler()` (mode change ACK):
  - If mode changed to MANUAL → stop all active schedules for the motor

**Device:**
- Device firmware should autonomously stop executing schedule commands when manual control is received.

**System:**
- Send notification: "Schedule #{id} stopped due to manual override"

---

## 9. Conflict #8 — Power Loss Recovery Has No Runtime Logic

### What Exists
- Schema has `power_loss_recovery: boolean` and `accumulated_on_seconds: integer` fields
- These fields are **never updated** — no logic reads or writes `accumulated_on_seconds`
- No power event monitoring tied to schedules

### What The Spec Requires
- When `power_loss_recovery = true`:
  - Track actual motor ON time in `accumulated_on_seconds`
  - If power fails during a schedule, calculate lost ON time
  - Extend the schedule's end_time to compensate
  - Schedule completes only when `accumulated_on_seconds >= runtime_minutes * 60`
- When `power_loss_recovery = false`:
  - Motor stops at configured end_time regardless of power losses

### Why It Conflicts
- The feature is declared in the schema but has **zero implementation**
- Power events (G02, G03, G04 live data groups) are already detected but not linked to scheduling
- `accumulated_on_seconds` stays at 0 forever
- Users enabling power recovery get no actual benefit

### How to Fix

**Backend:**
- In `updateStates()` (live data handler), when processing power/motor state changes:
  - If motor state changes from ON→OFF (power loss) while a schedule is RUNNING:
    - Record `last_stopped_at = now`
    - Calculate elapsed ON time and add to `accumulated_on_seconds`
  - If motor state changes from OFF→ON (power restored) while schedule is still active:
    - Record `last_started_at = now`
    - If `power_loss_recovery = true`, recalculate remaining runtime
- Add a `checkScheduleCompletion()` function:
  - For `power_loss_recovery = true`: complete when `accumulated_on_seconds >= runtime_minutes * 60`
  - For `power_loss_recovery = false`: complete when current time >= end_time

**Device:**
- Device should track ON-time locally and report `accumulated_on_seconds` in status updates
- On power restore, device resumes schedule execution if `power_loss_recovery = 1`

**System:**
- Only the **currently active** schedule compensates — future schedules remain fixed (per spec section 4.6)

---

## 10. Conflict #9 — One-Time vs Repeat Priority Not Implemented

### What Exists
- Schema has `repeat` (0 or 1) and `schedule_date` (for one-time schedules)
- Conflict detection checks time overlap but does **not** consider priority levels
- All schedules are treated equally during creation and execution

### What The Spec Requires
- **Priority Order:**
  1. One-Time Schedule (Highest priority)
  2. Repeat Schedule (Lower priority)
- If a One-Time schedule overlaps a Repeat schedule:
  - Repeat schedule **stops**
  - One-Time schedule **executes**
  - Repeat does NOT resume automatically

### Why It Conflicts
- Currently, **any** overlap is rejected during creation (`checkMotorScheduleConflict` throws)
- Per spec, a One-Time schedule should be **allowed** to override a Repeat schedule
- No runtime priority evaluation exists
- If both exist at the same time slot, behavior is undefined

### How to Fix

**Backend:**
- Modify `createMotorScheduleHandler`:
  - If new schedule is One-Time (`repeat = 0`) and conflicts with a Repeat schedule (`repeat = 1`):
    - Allow creation
    - Mark the conflicting Repeat schedule as `"STOPPED"` for the overlapping day
    - Send stop command to device for the Repeat schedule
  - If new schedule is Repeat and conflicts with a One-Time → still reject
  - If both are same type → still reject (current behavior)
- Add a `priority` field or derive it from `repeat` value:
  - `repeat = 0` → priority = 1 (high)
  - `repeat = 1` → priority = 2 (low)

**Device:**
- Device firmware should support priority-based schedule evaluation if multiple schedules are loaded

**System:**
- Notify user when a Repeat schedule is overridden by a One-Time schedule

---

## 11. Conflict #10 — Midnight-Crossing Schedules: Day Mapping Issue

### What Exists
- `doTimeRangesOverlap()` correctly handles midnight crossing by splitting into two segments
- `days_of_week` array stores which days the schedule runs on
- No logic maps the **end portion** of a midnight-crossing schedule to the **next day**

### What The Spec Requires
- Example: Schedule starts at 10:00 PM, ends at 2:00 AM
- If scheduled for Monday → runs Monday 10 PM to Tuesday 2 AM
- Tuesday should be treated as occupied (even though it's not in `days_of_week`)

### Why It Conflicts
- A schedule on Monday 10:00 PM – 2:00 AM only marks Monday in `days_of_week`
- Another schedule on Tuesday 1:00 AM – 3:00 AM would **not** be detected as conflicting (different day)
- Time overlap check works within a day, but cross-day occupancy is not tracked

### How to Fix

**Backend:**
- In `findConflictingSchedules()`, when the schedule crosses midnight:
  - Also check the **next day** for conflicts
  - If schedule has `days_of_week = [1]` (Monday) and crosses midnight, also check day `2` (Tuesday)
- Add a `getEffectiveDays()` helper:
  ```typescript
  function getEffectiveDays(days: number[], startTime: string, endTime: string): number[] {
    const crossesMidnight = timeToMinutes(startTime) > timeToMinutes(endTime);
    if (!crossesMidnight) return days;
    const nextDays = days.map(d => (d + 1) % 7);
    return [...new Set([...days, ...nextDays])].sort();
  }
  ```

**Device:**
- Device firmware handles midnight crossing internally — no change needed.

**System:**
- Display both days in the app UI (e.g., "Monday 10:00 PM → Tuesday 2:00 AM")

---

## 12. Conflict #11 — Repeat Field Semantics Inverted in Device Protocol

### What Exists
- **Database & Backend:** `repeat = 0` means Repeat OFF, `repeat = 1` means Repeat ON

### What The Spec Shows (Cyclic Schedule Section)
- In the device protocol documentation for Cyclic Schedule:
  > `rep: 0 = Repeat ON, 1 = Repeat OFF`

  This is **inverted** compared to the Time-Based section which says:
  > `rep: 0 = Repeat OFF, 1 = Repeat ON`

### Why It Conflicts
- The specification document itself has **contradictory definitions** for the `rep` field between Time-Based and Cyclic schedule types
- Backend uses `repeat = 1` as ON consistently
- If the device firmware uses different semantics for `rep` in cyclic mode, schedules will behave inversely

### How to Fix

**Backend + Device:**
- **Clarify with firmware team** which definition is correct
- Standardize: recommend `rep = 1 means Repeat ON` for both types (matching Time-Based definition)
- Add a comment in the payload helper documenting the agreed convention
- If device truly inverts for cyclic, add a conditional flip when publishing:
  ```typescript
  const rep = schedule.schedule_type === "CYCLIC"
    ? (schedule.repeat === 1 ? 0 : 1)  // invert for device
    : schedule.repeat;
  ```

---

## 13. Conflict #12 — No Scheduler Engine (Cron/Worker) to Trigger Schedules

### What Exists
- BullMQ is configured for job queues (used for MQTT message processing)
- No cron job, interval timer, or worker that evaluates pending schedules
- Schedule status stays at `PENDING` after creation — nothing transitions it to `SCHEDULED` or `RUNNING`

### What The Spec Requires
- At the schedule's start_time, the motor should automatically turn ON
- At the end_time, the motor should automatically turn OFF
- Cyclic schedules should alternate between ON/OFF intervals
- System must evaluate which schedules are due and trigger them

### Why It Conflicts
- Even if the device handles execution (device-side scheduling), the backend must:
  - Track state transitions (PENDING → SCHEDULED → RUNNING → COMPLETED)
  - Handle cases where device is offline at start_time
  - Manage day-of-week evaluation for repeat schedules
  - Trigger power loss recovery logic

### How to Fix

**Backend — Option A (Device-Side Execution, Recommended):**
- Device firmware handles all scheduling logic (start, stop, cycle, recovery)
- Backend sends schedule configuration to device and receives status updates
- Add a periodic health check (every 1 min via BullMQ repeatable job):
  - Query PENDING schedules where start_time has passed → mark as `RUNNING` (if device ACK received) or `FAILED` (if no ACK)
  - Query RUNNING schedules where end_time has passed → mark as `COMPLETED`
  - Detect stale schedules (stuck in RUNNING for too long)

**Backend — Option B (Server-Side Execution):**
- Add a BullMQ repeatable job that runs every minute
- Evaluate all PENDING/SCHEDULED schedules
- For due schedules: publish motor ON command via MQTT
- Handle timing, cycling, and recovery on the server
- **Not recommended** — device should be the source of truth for real-time motor control

---

## 14. Conflict #13 — Delete Handler Does Not Send MQTT Delete Command

### What Exists
- `deleteMotorScheduleHandler()` calls `stopScheduleById()` (if RUNNING) then `deleteRecordById()` — database only
- No MQTT message sent to device

### What The Spec Requires
- Delete sends: `{ T: 24, S: 120, D: { sch_type, id, cmd: 3 } }`
- Device responds: `{ T: 55, S: 120, D: { sch_type, id, del: 1 } }`
- Device removes the schedule from its internal memory

### Why It Conflicts
- Schedule is deleted from backend database but **still exists in device memory**
- Device continues executing the deleted schedule
- User thinks schedule is deleted but motor keeps turning ON/OFF

### How to Fix

**Backend:**
- Before deleting from DB, publish delete command to device
- Wait for device ACK (`T: 55`) confirming deletion
- Only then delete from database (or mark as DELETED first, delete after ACK)
- If device is offline, queue the delete command for when device reconnects

**Device:**
- No change needed — device already supports delete command.

---

## 15. Conflict #14 — Notification System Has No Schedule-Related Notifications

### What Exists
- FCM notification system for motor state changes, mode changes, faults, and SIM recharge
- Notification debouncing (2-minute window)
- No schedule-specific notification types

### What The Spec Requires
- Users (farmers) should be informed of:
  - Schedule created/started/stopped/completed/failed
  - Schedule overridden by manual control
  - Schedule overridden by higher-priority schedule
  - Power loss during scheduled run
  - Power recovery and schedule resumption

### Why It Conflicts
- Farmers rely on mobile notifications to know motor status
- Without schedule notifications, a farmer won't know:
  - If their 1:00 AM schedule actually started
  - If power loss interrupted the schedule
  - If manual override stopped the schedule

### How to Fix

**Backend:**
- Add schedule notification types to FCM service:
  - `SCHEDULE_STARTED`: "Schedule #{id} started — Motor is ON"
  - `SCHEDULE_COMPLETED`: "Schedule #{id} completed — Motor ran for {duration}"
  - `SCHEDULE_FAILED`: "Schedule #{id} failed — Device did not respond"
  - `SCHEDULE_STOPPED_MANUAL`: "Schedule #{id} stopped — Manual override detected"
  - `SCHEDULE_POWER_LOSS`: "Schedule #{id} interrupted — Power failure at {time}"
  - `SCHEDULE_POWER_RECOVERY`: "Schedule #{id} resuming — Power restored"
- Use existing `sendNotificationForADevice()` with schedule context
- Apply debouncing to avoid flooding during rapid power fluctuations

---

## 16. Conflict #15 — Schedule Status vs Device ACK Status Mismatch

### What Exists
- Backend schedule statuses: `PENDING, SCHEDULED, RUNNING, STOPPED, COMPLETED, FAILED, CANCELLED, DELETED, RESTARTED`
- Device ACK statuses: `1 = Success, 0 = Failed, 2 = Flash Issue, 3 = Invalid Data`
- Stop command ACK: `status: 1 = Success, 0 = Failed`

### Why It Conflicts
- Backend has 9 status values; device has 4
- No clear mapping between device ACK values and backend statuses
- `RESTARTED` status exists in backend but the device ACK for restart (cmd=2) only returns success/fail — backend doesn't know when to transition from `RESTARTED` → `RUNNING`
- `CANCELLED` vs `STOPPED` vs `DELETED` — overlapping semantics:
  - `stopScheduleById()` marks as `CANCELLED` (not `STOPPED`)
  - The enum has both `STOPPED` and `CANCELLED`

### How to Fix

**Backend:**
- Define explicit mapping:
  | Device ACK | Backend Status | Condition |
  |---|---|---|
  | Create ACK status=1 | SCHEDULED | Schedule accepted by device |
  | Create ACK status=0 | FAILED | Device rejected |
  | Create ACK status=2 | FAILED | Flash storage issue |
  | Create ACK status=3 | FAILED | Invalid data |
  | Stop ACK status=1 | STOPPED | Successfully stopped |
  | Restart ACK status=1 | SCHEDULED | Waiting to re-execute |
  | Delete ACK del=1 | DELETED | Removed from device |
  | Runtime: schedule triggers | RUNNING | Motor ON per schedule |
  | Runtime: schedule ends | COMPLETED | Quota/time met |

- Fix `stopScheduleById()` to use `STOPPED` status (not `CANCELLED`):
  - `STOPPED` = explicitly stopped by user
  - `CANCELLED` = cancelled by system (e.g., conflict resolution, priority override)

---

## 17. Summary Table

| # | Conflict | Severity | Layer | Status |
|---|---|---|---|---|
| 1 | MQTT Schedule ACK not handled | **Critical** | Backend + Device | Not implemented |
| 2 | Days encoding mismatch (bitmask vs array) | **High** | Backend → Device | Partial (decode exists, encode missing) |
| 3 | Cyclic schedule end_time forced | **Medium** | Backend + Schema | Workaround exists (defaults to 23:59) |
| 4 | Schedule ID exceeds 1–6 limit | **High** | Backend | No validation |
| 5 | No MQTT publish for schedule commands | **Critical** | Backend | Not implemented |
| 6 | Motor mode not enforced during scheduling | **High** | Backend + Device | Not implemented |
| 7 | Manual override doesn't cancel schedules | **High** | Backend | Not implemented |
| 8 | Power loss recovery has no runtime logic | **Medium** | Backend + Device | Schema only, no logic |
| 9 | One-Time vs Repeat priority not implemented | **Medium** | Backend | Not implemented |
| 10 | Midnight-crossing day mapping incomplete | **Low** | Backend | Time overlap works, day mapping missing |
| 11 | Repeat field semantics inverted in spec | **High** | Spec + Device | Ambiguous specification |
| 12 | No scheduler engine (cron/worker) | **Critical** | Backend | Not implemented |
| 13 | Delete handler doesn't send MQTT command | **High** | Backend | Not implemented |
| 14 | No schedule-related notifications | **Medium** | Backend | Not implemented |
| 15 | Schedule status vs device ACK mismatch | **Medium** | Backend | Mapping undefined |

### Priority for Implementation

1. **Phase 1 (Critical — Scheduling Won't Work Without These):**
   - Conflict #5: MQTT Publish for schedule commands
   - Conflict #1: MQTT Schedule ACK handling
   - Conflict #4: Schedule ID 1–6 limit
   - Conflict #12: Scheduler engine (health check worker)

2. **Phase 2 (High — Safety and Correctness):**
   - Conflict #6: Motor mode enforcement
   - Conflict #7: Manual override cancels schedules
   - Conflict #2: Days bitmask encoding for MQTT publish
   - Conflict #11: Clarify repeat field semantics with firmware team
   - Conflict #13: Delete sends MQTT command

3. **Phase 3 (Medium — Feature Completeness):**
   - Conflict #8: Power loss recovery runtime tracking
   - Conflict #9: One-Time vs Repeat priority
   - Conflict #3: Cyclic schedule end_time handling
   - Conflict #14: Schedule notifications
   - Conflict #15: Status mapping standardization

4. **Phase 4 (Low — Edge Cases):**
   - Conflict #10: Midnight-crossing day mapping

---

*End of Document*
