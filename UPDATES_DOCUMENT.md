# Single Motor Starter - Updates Analysis Document

**Project**: Peepulagri API - Single Motor Starter (IoT Water Pump Control System)
**Date**: 2026-03-03
**Branch**: dev

---

## Table of Contents

1. [Motor ON/OFF Action in Auto Mode](#1-motor-onoff-action-in-auto-mode)
2. [Meaningful Log Implementation (Idhara)](#2-meaningful-log-implementation-idhara)
3. [Resolve Inactive Update of Runtime Graph, Power etc.](#3-resolve-inactive-update-of-runtime-graph-power-etc)
4. [Update Graphs with Inactive/OFF Red Line in App](#4-update-graphs-with-inactiveoff-red-line-in-app)
5. [Update Graph Title to Motor, Remove Icon, Show Runtime](#5-update-graph-title-to-motor-remove-icon-show-runtime)

---

## 1. Motor ON/OFF Action in Auto Mode

### What is this update?

Currently, when a user triggers motor ON/OFF from the app (via `PATCH /motors/:id`), the system processes the request regardless of whether the device is in **AUTO** or **MANUAL** mode. There is **no confirmation step** when the device is in AUTO mode.

This update adds a **confirmation workflow** specifically for AUTO mode:
- If device mode = **AUTO** and user sends ON/OFF command -> Show a confirmation dialog in the app ("Motor is in Auto mode. Are you sure you want to control it manually?")
- If user **confirms** -> Proceed with motor control (publish MQTT command)
- If user **cancels** -> No action taken, request is discarded
- If device mode = **MANUAL** -> Normal behavior, no confirmation needed

### Why is this needed?

In AUTO mode, the device operates based on **schedules** (`motor_schedules` table) or automatic rules (e.g., auto-start on power recovery). If a user manually overrides the motor ON/OFF while in AUTO mode:
- It can **conflict** with active schedules, causing unexpected behavior
- The motor may turn back ON/OFF automatically after the manual override, confusing the user
- It can disrupt the **automatic power recovery** feature (where motor auto-starts after power returns)
- Farmers may accidentally override automation they've set up, leading to **crop damage** from missed irrigation

The confirmation acts as a **safety net** to prevent accidental manual overrides of automated operations.

### Where to implement?

| Layer | File | What to do |
|-------|------|------------|
| **API (Backend)** | `src/handlers/motor-handlers.ts` (Line ~65, `updateMotorHandler`) | Add a check: if the motor's current mode is AUTO and the request changes `state`, return a response indicating confirmation is needed (e.g., HTTP 200 with a `requires_confirmation: true` flag) |
| **API (Backend)** | `src/handlers/motor-handlers.ts` | Accept a `confirmed: true` parameter in the request body. Only proceed with MQTT publish if confirmed OR if mode is MANUAL |
| **MQTT Service** | `src/services/db/mqtt-db-services.ts` (Line ~457, `motorControlAckHandler`) | No change needed here - this handles device ACK, which only fires after the command is already sent |
| **App (Frontend)** | Mobile app motor control screen | Show confirmation dialog when API returns `requires_confirmation: true`. Re-send request with `confirmed: true` if user approves |
| **Validation** | `src/validations/motor-validations.ts` | Add `confirmed` as an optional boolean field in the motor update schema |

### When NOT to do this?

- Do **NOT** add confirmation for MANUAL mode - it would slow down normal operations
- Do **NOT** block the API endpoint entirely for AUTO mode - still allow control after confirmation
- Do **NOT** change the MQTT protocol or device firmware - this is purely an app/API layer safety check
- Do **NOT** apply this to mode changes (AUTO<->MANUAL switch) - only for state changes (ON/OFF)
- Do **NOT** add confirmation when the device itself sends state changes via MQTT (live data, ACKs) - only for user-initiated actions from the app

---

## 2. Meaningful Log Implementation (Idhara)

### What is this update?

Replace technical/developer-oriented log messages with **user-friendly, meaningful messages** that farmers and field operators can understand. "Idhara" refers to the app's log/history section.

**Current logs (technical):**
| Current Message | Problem |
|----------------|---------|
| `State updated to 'ON' with mode 'AUTO'` | Doesn't explain WHY or WHAT HAPPENED |
| `Phase Failure Fault` | Too technical, no actionable guidance |
| `State updated to 'OFF' with mode 'AUTO'` | Unclear - was it user action, fault, or power loss? |
| `State updated to 'OFF' with mode 'MANUAL'` | Doesn't indicate who stopped it |
| `State updated to 'ON' with mode 'MANUAL'` | Vague |
| `Mode updated from 'AUTO' to 'MANUAL'` | Doesn't explain context |
| `Mode updated from 'MANUAL' to 'AUTO'` | Vague |

**Updated logs (meaningful):**
| New Message | Why it's better |
|-------------|----------------|
| `The pump is running in MANUAL mode.` | Clear action + mode context |
| `Phase Failure detected—check power input.` | Identifies problem + gives actionable advice |
| `The pump is OFF in AUTO mode due to power failure.` | Explains the CAUSE (power failure) |
| `The pump is stopped in MANUAL mode.` | Clear that someone stopped it manually |
| `The pump is now ON in AUTO mode after power recovery.` | Explains WHY it turned on (power came back) |
| `Pump switched from AUTO to MANUAL mode.` | Clearer phrasing |
| `Pump switched from MANUAL to AUTO mode.` | Clearer phrasing |

### Why is this needed?

- **End users are farmers**, not engineers - they need plain language
- Current messages don't explain **causation** (WHY did the motor turn off?)
- Fault messages like "Phase Failure Fault" need **actionable context** ("check power input")
- Different causes of the same state (OFF due to power failure vs. OFF due to user action) currently show the **same message**, making troubleshooting impossible
- Notifications (FCM) also use these same messages, so they appear on user phones and must be readable

### Where to implement?

| Layer | File | What to do |
|-------|------|------------|
| **Activity Helper** | `src/helpers/activity-helper.ts` (Lines 203-228) | Update the message template strings in `MOTOR_STATE_UPDATED` and `MOTOR_MODE_UPDATED` blocks |
| **Motor Helper** | `src/helpers/motor-helper.ts` (Lines 195-245) | Update `prepareMotorStateControlNotificationData()` and `prepareMotorModeControlNotificationData()` notification title/body text |
| **Control Helpers** | `src/helpers/control-helpers.ts` (Lines 54-95) | Update fault/alert description strings (e.g., "Phase Failure Fault" -> "Phase Failure detected—check power input.") |
| **MQTT Helpers** | `src/helpers/mqtt-helpers.ts` | Update any inline log messages in live data processing |
| **MQTT DB Services** | `src/services/db/mqtt-db-services.ts` (Lines 183-195) | Update fault/alert notification messages |
| **Motor Log Writer** | `src/services/db/activity-log-writers/motor-log-writer.ts` | Update log message templates if any exist here |

**Key logic change**: The message must now be **context-aware**. For example, when motor turns OFF in AUTO mode:
- If `last_off_code = 2` (POWER_OFF from live data `l_of` field) -> "The pump is OFF in AUTO mode due to power failure."
- If `last_off_code = 3` (FAULT) -> "The pump is OFF in AUTO mode due to fault: {fault_description}"
- If `last_off_code = 0` (MANUAL action) -> "The pump is stopped in MANUAL mode."
- If `last_off_code = 1` (AUTO schedule) -> "The pump is stopped in AUTO mode (schedule completed)."

The `l_on` and `l_of` fields from the MQTT live data payload (data groups G01-G04) provide this context but are **currently not used** in message generation.

### When NOT to do this?

- Do **NOT** change the `action` enum values (MOTOR_STATE_UPDATED, etc.) - only change the human-readable `message` field
- Do **NOT** alter the `old_data`/`new_data` JSON structure in activity logs - those are for programmatic use
- Do **NOT** translate messages to regional languages in this update - keep English; localization can be a separate effort
- Do **NOT** change fault/alert **codes** (0x01, 0x20, etc.) - only change the **description text**
- Do **NOT** modify messages for internal/debug logs (Winston logger) - only user-facing messages in `user_activity_logs` table and FCM notifications

---

## 3. Resolve Inactive Update of Runtime Graph, Power etc.

### What is this update?

The runtime graph currently has a bug where **inactive/OFF periods are not being recorded or updated correctly**. When the motor or device goes inactive (power loss, device offline, no heartbeat), the runtime tracking system either:
- Leaves the last record **open-ended** (no `end_time`) indefinitely
- Doesn't create a record for the OFF/inactive period at all
- Shows stale/incorrect duration values

This causes the graph to show **gaps** or **incorrect continuous ON periods** when the device was actually OFF.

### Why is this needed?

- **Farmers track pump usage** for billing (electricity) and irrigation planning
- If OFF periods aren't recorded, **total runtime appears inflated**, leading to wrong electricity cost estimates
- When device loses power suddenly (common in rural India), the `trackMotorRunTime()` function may not get called because there's no MQTT message for an abrupt power loss
- The heartbeat mechanism (T=40, every ~5 minutes) should detect this, but currently **heartbeat timeout doesn't close open runtime records**
- Power consumption graphs (`parameter=power` in runtime endpoint) also depend on accurate power state tracking

### Where to implement?

| Layer | File | What to do |
|-------|------|------------|
| **Motor Runtime Tracker** | `src/services/db/motor-services.ts` (Lines 150-321, `trackMotorRunTime()`) | Fix edge cases: when power goes from 1->0 without motor state change, close the open motor runtime record |
| **Device Runtime Tracker** | `src/services/db/motor-services.ts` (Lines 323-396, `trackDeviceRunTime()`) | Ensure device power-off events properly close open records with correct `end_time` and `duration` |
| **Heartbeat Handler** | `src/services/db/mqtt-db-services.ts` (`heartbeatHandler`) | Add logic: if heartbeat stops arriving for X minutes, auto-close any open runtime records as "inactive" |
| **Live Data Handler** | `src/services/db/mqtt-db-services.ts` (`liveDataHandler` / `saveLiveDataTopic`) | When `power_state` changes from 1->0 in live data, ensure runtime records are closed |
| **Runtime Query** | `src/services/db/motor-services.ts` (Lines 398-441, `getMotorRunTime()`) | Fix query to also return periods where `motor_state = 0` (currently may only be fetching ON periods depending on filters) |
| **Starter Runtime Query** | `src/services/db/starter-services.ts` (Lines 303-331, `getStarterRunTime()`) | Same fix for device-level runtime |
| **MQTT Helpers** | `src/helpers/mqtt-helpers.ts` | In `saveLiveDataTopic()`, ensure state transitions (especially power loss via group G04) properly trigger runtime record closure |

**Root cause areas to investigate:**
1. In `trackMotorRunTime()`: The function handles `previous_state` vs `new_state` but may not handle the case where power drops without an explicit state change message
2. Open records with `end_time = NULL`: Need a cleanup mechanism (cron job or heartbeat-based) to close stale records
3. Data group G04 (both power & motor OFF): Verify this properly triggers runtime closure

### When NOT to do this?

- Do **NOT** delete or modify existing runtime records - only fix the logic for creating/closing future records
- Do **NOT** add a cron job if the heartbeat mechanism can be leveraged instead - avoid adding infrastructure complexity
- Do **NOT** retroactively fix historical data in this update - that should be a separate data migration task
- Do **NOT** change the runtime table schema unless absolutely necessary - prefer fixing the tracking logic
- Do **NOT** change the MQTT payload format or device firmware - the fix should be purely server-side

---

## 4. Update Graphs with Inactive/OFF Red Line in App

### What is this update?

Add visual distinction in the app's runtime graph by showing **OFF/inactive periods as a red line/bar** alongside the existing ON/active periods (presumably shown in green). Currently, the graph either:
- Shows only ON periods (no data for OFF)
- Shows gaps/blank spaces where the motor was OFF
- Doesn't visually differentiate between "OFF by user" vs "OFF due to power failure" vs "device offline"

### Why is this needed?

- Without red lines for OFF periods, the graph has **blank gaps** that users can't interpret
- Users need to see the **complete timeline**: when was the pump ON (green) and when was it OFF (red)
- This helps farmers identify **patterns**: frequent power cuts, motor faults during specific hours, etc.
- A continuous timeline (green + red) is much more informative than a sparse one (green only)
- It also makes the [runtime duration issue (Update #3)](#3-resolve-inactive-update-of-runtime-graph-power-etc) visible to users

### Where to implement?

| Layer | File | What to do |
|-------|------|------------|
| **API Response** | `src/services/db/motor-services.ts` (`getMotorRunTime()`) | Ensure both ON (`motor_state=1`) AND OFF (`motor_state=0`) records are returned in the query results |
| **API Response** | `src/services/db/starter-services.ts` (`getStarterRunTime()`) | Same - include both power ON and power OFF records |
| **API Response Enhancement** | `src/handlers/starter-handlers.ts` (`starterRunTimeHandler`) | Optionally add a `status` field ("ACTIVE"/"INACTIVE") and `color` hint ("#22c55e"/"#ef4444") to each record for the app to consume |
| **App (Frontend)** | Mobile app graph component | Render ON periods in **green** and OFF periods in **red** using the `motor_state` or `power_state` field |

**API response structure should include:**
```
{
  "data": [
    { "start_time": "...", "end_time": "...", "duration": "2h 30m", "motor_state": 1, "status": "ON" },
    { "start_time": "...", "end_time": "...", "duration": "1h 15m", "motor_state": 0, "status": "OFF" }
  ]
}
```

The app uses `motor_state` to decide color:
- `motor_state = 1` (ON) -> Green bar/line
- `motor_state = 0` (OFF) -> Red bar/line

### When NOT to do this?

- Do **NOT** implement color logic on the backend if the app already handles it - just ensure the data includes OFF records
- Do **NOT** add colors as database columns - they are presentation concerns for the frontend only
- Do **NOT** remove the existing `state` query filter on the runtime endpoint - it should remain optional (default: return both ON and OFF)
- Do **NOT** change this for the admin/web dashboard unless explicitly required - focus on the mobile app first
- This depends on [Update #3](#3-resolve-inactive-update-of-runtime-graph-power-etc) being completed first - OFF records must exist before they can be displayed

---

## 5. Update Graph Title to Motor, Remove Icon, Show Runtime

### What is this update?

Three UI-level changes to the runtime graph in the mobile app:

1. **Title change**: Rename the graph title from "Motor & Power" to just **"Motor"**
2. **Icon removal**: Remove the motor icon that currently appears next to the graph title
3. **Runtime display**: Show the **total runtime duration** (e.g., "2hr 30min") prominently on the graph

### Why is this needed?

1. **Title "Motor & Power"** is misleading because:
   - The graph now shows motor runtime only (after separating power into its own view)
   - Having "Power" in the title when it's not shown creates confusion
   - A simple "Motor" title is clearer and more accurate

2. **Motor icon removal**:
   - The icon takes up space without adding informational value
   - The graph title already says "Motor" - the icon is redundant
   - Cleaner UI with more space for the actual graph data

3. **Runtime display "2hr 30min"**:
   - Users want to see **total pump running time at a glance** without doing mental math
   - Currently they have to visually estimate from the graph bars, which is error-prone
   - This is the most critical metric for farmers - "How long did my pump run today?"
   - The duration data already exists in the `motors_run_time.duration` field - it just needs to be **aggregated and displayed**

### Where to implement?

| Layer | File | What to do |
|-------|------|------------|
| **API (Backend)** | `src/services/db/motor-services.ts` (`getMotorRunTime()`) | Add a **summary/aggregation** to the response: total ON duration across all records in the queried period |
| **API (Backend)** | `src/handlers/starter-handlers.ts` (`starterRunTimeHandler`) | Include aggregated `total_runtime` (e.g., "2hr 30min") in the API response alongside the records array |
| **App (Frontend)** | Mobile app graph component | 1. Change title text from "Motor & Power" to "Motor" |
| **App (Frontend)** | Mobile app graph component | 2. Remove the motor icon element |
| **App (Frontend)** | Mobile app graph component | 3. Display `total_runtime` from API response below/beside the title |

**API response structure should add:**
```
{
  "summary": {
    "total_runtime": "2hr 30min",
    "total_runtime_minutes": 150,
    "total_on_periods": 5,
    "total_off_periods": 3
  },
  "data": [ ... existing runtime records ... ]
}
```

**Runtime aggregation logic (backend):**
- Sum all `duration` values where `motor_state = 1` (ON) within the queried date range
- Convert total minutes to human-readable format: "2hr 30min", "45min", "5hr 12min"
- This can be calculated from the existing `motors_run_time` records

### When NOT to do this?

- Do **NOT** change the API endpoint URL or parameters - only enhance the response payload
- Do **NOT** remove power-related data from the API - other parts of the app or future features may need it
- Do **NOT** hardcode the runtime format - make it dynamic based on actual duration (hours + minutes)
- Do **NOT** change graph titles on the admin web dashboard - this is mobile app only
- Do **NOT** remove the `power` query parameter option from the runtime endpoint - keep backward compatibility

---

## Dependencies Between Updates

```
Update #3 (Fix inactive runtime tracking)
    |
    v
Update #4 (Red line for OFF periods)  -- depends on #3 having correct OFF records
    |
    v
Update #5 (Graph title + runtime display)  -- depends on #3 for accurate duration

Update #1 (Auto mode confirmation)  -- independent, can be done in parallel
Update #2 (Meaningful logs)         -- independent, can be done in parallel
```

**Recommended implementation order:**
1. Update #2 (Meaningful logs) - Lowest risk, no dependencies, immediate UX improvement
2. Update #1 (Auto mode confirmation) - Independent, important safety feature
3. Update #3 (Fix runtime tracking) - Foundation for Updates #4 and #5
4. Update #4 (Red line OFF periods) - Requires #3 to be complete
5. Update #5 (Graph title + runtime) - Requires #3 for accurate totals

---

## Files Impacted Summary

| File | Updates Affected |
|------|-----------------|
| `src/handlers/motor-handlers.ts` | #1 |
| `src/handlers/starter-handlers.ts` | #3, #4, #5 |
| `src/helpers/activity-helper.ts` | #2 |
| `src/helpers/motor-helper.ts` | #2 |
| `src/helpers/control-helpers.ts` | #2 |
| `src/helpers/mqtt-helpers.ts` | #2, #3 |
| `src/services/db/motor-services.ts` | #3, #4, #5 |
| `src/services/db/starter-services.ts` | #3, #4 |
| `src/services/db/mqtt-db-services.ts` | #2, #3 |
| `src/validations/motor-validations.ts` | #1 |
| `src/services/db/activity-log-writers/motor-log-writer.ts` | #2 |
| Mobile App (Frontend) | #1, #4, #5 |

---

## Summary

| # | Update | Backend | Frontend | Risk | Priority |
|---|--------|---------|----------|------|----------|
| 1 | Auto mode confirmation | API handler + validation | Confirmation dialog | Low | High (safety) |
| 2 | Meaningful logs | Activity/control helpers | Display only | Low | Medium (UX) |
| 3 | Fix inactive runtime | Runtime tracking + MQTT | None | Medium | High (data accuracy) |
| 4 | Red line for OFF | Runtime query enhancement | Graph rendering | Low | Medium (UX) |
| 5 | Graph title + runtime | Add summary aggregation | Title/icon/display | Low | Low (cosmetic + info) |
