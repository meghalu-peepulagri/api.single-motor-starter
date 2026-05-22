# Multi Motor Backend — Full Implementation Plan

> **Branch:** `feat/api-multi-motor`  
> **Date:** 2026-05-20  
> **Scope:** All backend changes required to support multi-motor devices (`starter_type = "MULTI_STARTER"`) end-to-end

---

## Table of Contents

1. [What is a Multi Motor Device](#1-what-is-a-multi-motor-device)
2. [Schema — What Exists](#2-schema--what-exists)
3. [MQTT Payload Formats](#3-mqtt-payload-formats)
4. [Device Creation](#4-device-creation)
5. [Motor Slot Management](#5-motor-slot-management)
6. [Motor Assign](#6-motor-assign)
7. [Motor Detach / Delete](#7-motor-detach--delete)
8. [Motor Replace](#8-motor-replace)
9. [MQTT Live Data Flow](#9-mqtt-live-data-flow)
10. [MQTT Motor Control & Mode Change](#10-mqtt-motor-control--mode-change)
11. [Analytics — With & Without Motors](#11-analytics--with--without-motors)
12. [Settings — With & Without Motors](#12-settings--with--without-motors)
13. [Logs & Activity Trail](#13-logs--activity-trail)
14. [Critical Query Fixes](#14-critical-query-fixes)
15. [All Changes Summary Table](#15-all-changes-summary-table)
16. [Motor Operations — Full Examples](#16-motor-operations--full-examples)
17. [Live Data With No Motors Assigned](#17-live-data-with-no-motors-assigned)
18. [Analytics & Raw Data by motor_reference](#18-analytics--raw-data-by-motor_reference)
19. [Motor Replace — motor_reference Explained](#19-motor-replace--motor_reference-explained)

---

## 1. What is a Multi Motor Device

A device with `starter_type = "MULTI_STARTER"` controls **2 motors** (`m1`, `m2`) from a single hardware unit.  
A device with `starter_type = "SINGLE_STARTER"` controls **1 motor**.

| Aspect | `SINGLE_STARTER` | `MULTI_STARTER` |
|---|---|---|
| Motors auto-created at device add | Yes — 1 motor (`Pump 1`) created automatically | No — 2 motors added manually via motor API after device creation |
| Motors per device | 1 | 2 (`m1` and `m2`) |
| MQTT live data format | Flat group data | Per-motor blocks inside group (`m1`, `m2` keys) |
| Motor control ACK `D` field | Plain int (`0`/`1`) | Object `{ m1: { m_s: 0 }, m2: { m_s: 1 } }` |
| Mode change ACK `D` field | Plain int (`1`/`2`) | Object `{ m1: { mode: 1 }, m2: { mode: 2 } }` |

---

## 2. Schema — What Exists

### `starter_boxes` table — No migration needed

| Column | Type | Purpose |
|---|---|---|
| `starter_type` | `ENUM("SINGLE_STARTER","MULTI_STARTER")` | Drives all branching logic in MQTT handlers and device creation |

### `motors` table — No migration needed

| Column | Type | Purpose |
|---|---|---|
| `motor_reference` | `varchar` | Payload key `"m1"` or `"m2"` — links DB motor row to MQTT data block |
| `starter_id` | `integer FK` | Links motor to its device |

### `starter_parameters` table — No migration needed

`motor_id` and `motor_reference` both already exist. Each live data row records which motor it belongs to.

---

## 3. MQTT Payload Formats

All messages arrive on: `peepul/{device}/status`  
Dispatched by `T` field value.

### HEART_BEAT (T=40) — No branching by starter type

```json
{ "T": 40, "S": 1, "D": { "s_q": 18, "nwt": 4 } }
```
Device-level only. Same for both starter types.

### LIVE_DATA (T=41) — Branches by starter type

**`SINGLE_STARTER`:**
```json
{ "T": 41, "S": 1, "D": { "G01": { "v": 230, "c": 5.2, "pwr": 1196, "m_s": 1, "mode": 1 } } }
```

**`MULTI_STARTER` — `m1`/`m2` keys inside group:**
```json
{
  "T": 41, "S": 1,
  "D": {
    "G01": {
      "p_v": 230,
      "pwr": 1196,
      "llv": 210,
      "temp": 42,
      "m1": { "v": 228, "c": 5.1, "m_s": 1, "mode": 1, "flt": 0, "alt": 0 },
      "m2": { "v": 229, "c": 3.8, "m_s": 0, "mode": 2, "flt": 0, "alt": 0 }
    },
    "ct": null
  }
}
```

Shared fields (`p_v`, `pwr`, `llv`, `temp`) sit at group level and are merged into each motor block before processing.

### MOTOR_CONTROL_ACK (T=31) — Branches by starter type

**`SINGLE_STARTER`:** `"D": 1`  
**`MULTI_STARTER`:** `"D": { "m1": { "m_s": 1 }, "m2": { "m_s": 0 } }`

### MODE_CHANGE_ACK (T=32) — Branches by starter type

**`SINGLE_STARTER`:** `"D": 1`  
**`MULTI_STARTER`:** `"D": { "m1": { "mode": 1 }, "m2": { "mode": 2 } }`

### All other topics (T=33,34,39,40,44,50,52,48) — No branching

Device-level only. `D` is a plain int or device metadata. No per-motor data. Same for both starter types.

---

## 4. Device Creation

### File: `src/validations/schema/starter-validations.ts`

Add `starter_type` to `vAddStarter`:

```ts
export const vAddStarter = v.object({
  name: starterBoxTitleValidator,
  pcb_number: pcbNumberValidator,
  starter_number: starterNumberValidator,
  mac_address: macAddressValidator,
  gateway_id: v.optional(v.union([v.number(), v.null()])),
  hardware_version: hardwareVersion,
  device_mobile_number: v.nullish(v.optional(simNumberValidator)),
  starter_type: v.optional(v.picklist(["SINGLE_STARTER", "MULTI_STARTER"])),  // ADD
});
```

### File: `src/types/app-types.ts`

Add `starter_type` to `starterBoxPayloadType`:

```ts
export interface starterBoxPayloadType {
  name?: string | null | undefined;
  pcb_number?: string | null | undefined;
  starter_number: string;
  mac_address?: string | null | undefined;
  gateway_id?: number | null | undefined;
  starter_type?: "SINGLE_STARTER" | "MULTI_STARTER";  // ADD
}
```

### File: `src/helpers/starter-helper.ts`

Skip `motorDetails` for `MULTI_STARTER` — motors are added manually after device creation:

```ts
export function prepareStarterData(...) {
  const motorDetails = starterBoxPayload.starter_type === "MULTI_STARTER"
    ? undefined
    : { name: `Pump 1 - ${starterBoxPayload.pcb_number}`, hp: 2 };

  return {
    ...starterBoxPayload,
    status: "INACTIVE",
    device_status: "READY",
    created_by: userPayload.id,
    motorDetails,
    ...
  };
}
```

### File: `src/services/db/starter-services.ts` — `addStarterWithTransaction`

Guard the motor insert:

```ts
const starter = await saveSingleRecord<StarterBoxTable>(starterBoxes, preparedStarerData, trx);

if (preparedStarerData.motorDetails) {
  await saveSingleRecord<MotorsTable>(motors, { ...preparedStarerData.motorDetails, starter_id: starter.id }, trx);
}
```

### What gets stored

| Payload | `starter_boxes` | `motors` |
|---|---|---|
| `starter_type: "SINGLE_STARTER"` | 1 row | 1 motor auto-created (`Pump 1`, hp=2) |
| `starter_type: "MULTI_STARTER"` | 1 row | **0 motors** — add m1 and m2 via motor API |
| `starter_type` omitted | 1 row, defaults to `"SINGLE_STARTER"` | 1 motor auto-created |

---

## 5. Motor Slot Management

A `MULTI_STARTER` device has 2 fixed slots: `m1` and `m2`.  
A slot is **filled** when a non-ARCHIVED motor with that `motor_reference` exists for the device.  
A slot is **available** when no such motor exists yet.

### File: `src/services/db/starter-services.ts` — `starterConnectedMotors`

Add `motor_reference` and `starter_type` to the query:

```ts
// starter_boxes columns — ADD:
starter_type: true,

// motors columns — ADD:
motor_reference: true,
```

### File: `src/handlers/starter-handlers.ts` — `starterConnectedMotorsHandler`

Compute available/filled slots and include in response:

```ts
const ALL_SLOTS = ["m1", "m2"];
const filledSlots = connectedMotors.motors
  .map((m: any) => m.motor_reference)
  .filter(Boolean);

const slotInfo = connectedMotors.starter_type === "MULTI_STARTER"
  ? {
      filled_slots: filledSlots,
      available_slots: ALL_SLOTS.filter(s => !filledSlots.includes(s)),
    }
  : null;

return sendResponse(c, 200, ..., { ...connectedMotors, ...slotInfo });
```

### Response shape (MULTI_STARTER, only m1 added so far):

```json
{
  "id": 42,
  "starter_type": "MULTI_STARTER",
  "motors": [
    { "id": 5, "motor_reference": "m1", "alias_name": "Pump 1", "state": 0, "mode": "AUTO" }
  ],
  "filled_slots": ["m1"],
  "available_slots": ["m2"]
}
```

---

## 6. Motor Assign

There are **two separate ways** to assign a motor to a device slot.

---

### 6a. Create new motor and assign in one step

Motor does not exist yet. Create it and link it to the device slot in a single `POST /motors` request.

**When to use:** First time adding motors to a `MULTI_STARTER` device after it is created.

### File: `src/validations/schema/motor-validations.ts`

```ts
export const vAddMotor = v.object({
  name: motorNameValidator,
  hp: hpValidator,
  location_id: requiredNumber(LOCATION_REQUIRED),
  starter_id: v.optional(v.number()),                             // ADD
  motor_reference: v.optional(v.picklist(["m1", "m2"])),         // ADD
});
```

### File: `src/handlers/motor-handlers.ts` — `addMotorHandler`

Add slot-conflict guard and pass new fields to insert:

```ts
// Block duplicate slot before insert:
if (validMotorReq.starter_id && validMotorReq.motor_reference) {
  const slotTaken = await db.query.motors.findFirst({
    where: and(
      eq(motors.starter_id, validMotorReq.starter_id),
      eq(motors.motor_reference, validMotorReq.motor_reference),
      ne(motors.status, "ARCHIVED")
    )
  });
  if (slotTaken) throw new ConflictException("Motor slot already occupied");
}

const preparedMotorPayload: NewMotor = {
  name: validMotorReq.name,
  alias_name: validMotorReq.name,
  created_by: userPayload.id,
  location_id: validMotorReq.location_id,
  hp: validMotorReq.hp.toString(),
  starter_id: validMotorReq.starter_id ?? undefined,
  motor_reference: validMotorReq.motor_reference ?? undefined,
};
```

### What gets stored in `motors`

| Column | Value |
|---|---|
| `starter_id` | linked device id |
| `motor_reference` | `"m1"` or `"m2"` |
| `status` | `"ACTIVE"` |
| `state` | `0` (default OFF) |
| `mode` | `"AUTO"` (default) |

---

### 6b. Assign an already existing motor to a device slot

Motor already exists in DB (was previously detached or created without a device).  
Link it to a slot without creating a new record.

**When to use:** Motor was detached from one device and needs to be assigned to another. Or motor was created standalone and now needs to be linked to a device.

#### New endpoint: `PATCH /motors/:id/assign`

### File: `src/routes/motor-routes.ts`

```ts
motorRoutes.patch("/:id/assign", isAuthorized, motorHandlers.assignMotorHandler);
```

### File: `src/validations/schema/motor-validations.ts`

```ts
export const vAssignMotor = v.object({
  starter_id: requiredNumber("Starter id is required"),
  motor_reference: v.picklist(["m1", "m2"], "Motor reference must be m1 or m2"),
});
```

### File: `src/handlers/motor-handlers.ts` — new `assignMotorHandler`

```ts
assignMotorHandler = async (c: Context) => {
  const motorId = +c.req.param("id")!;
  const payload = await c.req.json();
  const userPayload = c.get("user_payload");
  const validPayload = await validatedRequest<vAssignMotor>("assign-motor", payload, ...);

  // Motor must exist and be active
  const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(
    motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]
  );
  if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

  // Motor must not already be linked to a device
  if (motor.starter_id !== null) {
    throw new ConflictException("Motor is already assigned to a device. Detach it first.");
  }

  // Target slot must be free on the target device
  const slotTaken = await db.query.motors.findFirst({
    where: and(
      eq(motors.starter_id, validPayload.starter_id),
      eq(motors.motor_reference, validPayload.motor_reference),
      ne(motors.status, "ARCHIVED")
    )
  });
  if (slotTaken) throw new ConflictException("Motor slot already occupied on target device");

  await db.transaction(async trx => {
    await updateRecordById<MotorsTable>(motors, motorId, {
      starter_id: validPayload.starter_id,
      motor_reference: validPayload.motor_reference,
      assigned_at: new Date(),
    }, trx);

    await ActivityService.writeMotorAssignedLog(
      userPayload.id, motorId, validPayload.starter_id, validPayload.motor_reference, trx
    );
  });

  return sendResponse(c, 200, "Motor assigned successfully");
};
```

### What changes in `motors`

| Column | Before | After |
|---|---|---|
| `starter_id` | `null` | target device id |
| `motor_reference` | `null` | `"m1"` or `"m2"` |
| `assigned_at` | old value | new timestamp |
| All other columns | unchanged | unchanged |

All historical data (parameters, runtime, logs) is preserved and now associated with the new device via the updated `starter_id`.

---

## 6c. Detach motor from device (back to pool)

Remove motor from its device slot without archiving it. Motor becomes available for re-assignment.

**When to use:** Motor needs to move to a different device. Or slot needs to be freed temporarily.

#### New endpoint: `PATCH /motors/:id/detach`

### File: `src/routes/motor-routes.ts`

```ts
motorRoutes.patch("/:id/detach", isAuthorized, motorHandlers.detachMotorHandler);
```

### File: `src/handlers/motor-handlers.ts` — new `detachMotorHandler`

```ts
detachMotorHandler = async (c: Context) => {
  const motorId = +c.req.param("id")!;
  const userPayload = c.get("user_payload");

  const motor = await getSingleRecordByMultipleColumnValues<MotorsTable>(
    motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]
  );
  if (!motor) throw new NotFoundException(MOTOR_NOT_FOUND);

  // Nothing to detach if motor is not assigned to any device
  if (motor.starter_id === null) {
    throw new BadRequestException("Motor is not assigned to any device");
  }

  const starterId = motor.starter_id;

  await db.transaction(async trx => {
    // Clear device link — motor goes to pool
    await updateRecordById<MotorsTable>(motors, motorId, {
      starter_id: null,
      motor_reference: null,
    }, trx);

    // Check if device still has other active motors
    const remaining = await trx
      .select({ id: motors.id })
      .from(motors)
      .where(and(
        eq(motors.starter_id, starterId),
        ne(motors.status, "ARCHIVED"),
        ne(motors.id, motorId)
      ));

    // Reset device only if no motors remain
    if (remaining.length === 0) {
      await updateRecordById<StarterBoxTable>(
        starterBoxes, starterId,
        { device_status: "DEPLOYED", user_id: null },
        trx
      );
    }

    await ActivityService.writeMotorDetachedLog(
      userPayload.id, motorId, starterId, trx
    );
  });

  return sendResponse(c, 200, "Motor detached successfully");
};
```

### What changes in `motors`

| Column | Before | After |
|---|---|---|
| `starter_id` | device id | `null` |
| `motor_reference` | `"m1"` or `"m2"` | `null` |
| `status` | `"ACTIVE"` | `"ACTIVE"` (unchanged) |

Motor is now in the unassigned pool. All its history (parameters, runtime, logs) is fully preserved.

---

## 7. Motor Detach / Delete

### File: `src/handlers/motor-handlers.ts` — `deleteMotorHandler`

**Current (wrong for multi-motor devices):**  
Always sets device to `DEPLOYED` + clears `user_id` on any motor deletion.

**Fixed:**  
For a `MULTI_STARTER` device with 2 motors, deleting `m1` while `m2` is still active must NOT reset the device.  
Only reset the device when **all** motors are deleted.  
Also cancel any active schedules for the deleted motor.

```ts
await db.transaction(async trx => {
  // 1. Archive the motor
  await updateRecordById<MotorsTable>(motors, motor.id, { status: "ARCHIVED" }, trx);

  if (motor.starter_id) {
    // 2. Count remaining active motors after archiving this one
    const remaining = await trx
      .select({ id: motors.id })
      .from(motors)
      .where(and(
        eq(motors.starter_id, motor.starter_id),
        ne(motors.status, "ARCHIVED"),
        ne(motors.id, motor.id)
      ));

    // 3. Reset device only when the last motor is gone
    if (remaining.length === 0) {
      await updateRecordById<StarterBoxTable>(
        starterBoxes, motor.starter_id,
        { device_status: "DEPLOYED", user_id: null },
        trx
      );
    }
  }

  // 4. Cancel active schedules for this motor
  await trx.update(motorSchedules)
    .set({ status: "ARCHIVED" })
    .where(and(
      eq(motorSchedules.motor_id, motor.id),
      ne(motorSchedules.status, "ARCHIVED")
    ));

  // 5. Activity log
  await ActivityService.writeMotorDeletedLog(
    userPayload.id, motor.id, trx, motor.starter_id || undefined
  );
});
```

### What happens to historical data after delete

| Table | What happens | Data preserved? |
|---|---|---|
| `motors` | `status = "ARCHIVED"`, row stays | Yes |
| `starter_parameters` | Untouched — `motor_id` still references the archived motor | Yes |
| `motors_run_time` | Untouched | Yes |
| `motor_status_history` | Untouched | Yes |
| `motor_schedules` | Active ones set to `"ARCHIVED"` — past schedule logs preserved | Future runs cancelled only |
| `starter_boxes` | `device_status → "DEPLOYED"` only if this was the last motor | — |

---

## 8. Motor Replace

Replacing a motor means: swap the physical hardware in a slot while keeping all history tied to the old motor.

### Why `motor_reference` is NOT in the request payload

You call `PATCH /motors/:id/replace` where `:id` is the **old motor's DB id**.  
The server reads `motor_reference` directly from the old motor row in DB.  
The new motor is inserted into the **same slot** automatically.

You do not need to send `motor_reference` in the payload because you already told the server **which motor** (and therefore which slot) to replace via the URL param `:id`.

| Field | Where it comes from |
|---|---|
| `motor_reference` of new motor | Copied from old motor's `motor_reference` in DB |
| `starter_id` of new motor | Copied from old motor's `starter_id` in DB |
| `name`, `hp`, `location_id` | Sent in request payload (new motor's details) |

---

### New endpoint: `PATCH /motors/:id/replace`

### File: `src/routes/motor-routes.ts`

```ts
motorRoutes.patch("/:id/replace", isAuthorized, motorHandlers.replaceMotorHandler);
```

### File: `src/validations/schema/motor-validations.ts`

```ts
export const vReplaceMotor = v.object({
  name: motorNameValidator,
  hp: hpValidator,
  location_id: requiredNumber(LOCATION_REQUIRED),
  // motor_reference is NOT here — inherited from old motor in DB
});
```

### File: `src/handlers/motor-handlers.ts` — new `replaceMotorHandler`

```ts
replaceMotorHandler = async (c: Context) => {
  const motorId = +c.req.param("id")!;
  const payload = await c.req.json();
  const userPayload = c.get("user_payload");
  const validPayload = await validatedRequest<vReplaceMotor>("replace-motor", payload, ...);

  const oldMotor = await getSingleRecordByMultipleColumnValues<MotorsTable>(
    motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"]
  );
  if (!oldMotor) throw new NotFoundException(MOTOR_NOT_FOUND);

  // Old motor must be linked to a device and have a slot
  if (!oldMotor.starter_id || !oldMotor.motor_reference) {
    throw new BadRequestException("Motor is not assigned to any device slot");
  }

  await db.transaction(async trx => {
    // Archive old motor — all its parameters/runtime/history stay linked to old motor_id
    await trx.update(motors)
      .set({ status: "ARCHIVED", updated_at: new Date() })
      .where(eq(motors.id, oldMotor.id));

    // Insert new motor into the SAME slot (motor_reference + starter_id from old motor)
    const newMotor = await saveSingleRecord<MotorsTable>(motors, {
      name: validPayload.name,
      alias_name: validPayload.name,
      hp: validPayload.hp.toString(),
      location_id: validPayload.location_id,
      starter_id: oldMotor.starter_id,           // same device
      motor_reference: oldMotor.motor_reference, // same slot (m1 or m2)
      created_by: userPayload.id,
      assigned_at: new Date(),
    }, trx);

    // Log records: which device, which slot, old motor id, new motor id
    await ActivityService.writeMotorReplacedLog(
      userPayload.id,
      oldMotor.id,
      newMotor.id,
      oldMotor.starter_id,
      oldMotor.motor_reference,  // which slot was replaced (m1 or m2)
      trx
    );
  });

  return sendResponse(c, 200, "Motor replaced successfully");
};
```

### What gets stored

| Effect | Detail |
|---|---|
| Old motor | `status = "ARCHIVED"` — all `starter_parameters`, runtime, history rows stay linked to old `motor_id` |
| New motor | Fresh row, same `starter_id` + `motor_reference`, new `motor_id` — clean slate for future data |
| Activity log | Records: `device_id`, `slot (motor_reference)`, `old_motor_id`, `new_motor_id`, `replaced_by (user)` |
| Future MQTT live data | `resolveMotorsFromPayload` matches by `motor_reference` → picks up new motor id automatically |

### Activity log payload for replace

```ts
// writeMotorReplacedLog stores:
{
  action: "MOTOR_REPLACED",
  starter_id: 10,
  motor_reference: "m1",       // which slot was replaced
  old_motor_id: 5,
  new_motor_id: 7,
  replaced_by: userPayload.id,
  replaced_at: new Date()
}
```

---

## 9. MQTT Live Data Flow

### File: `src/helpers/mqtt-helpers.ts` — `liveDataHandler`

```
MQTT message (T=41) arrives on peepul/{device}/status
  → getStarterByMacWithMotor()        [needs starter_type + motor_reference in SELECT — see §14]
  → validateLiveDataFormat()          [checks G01/G02/G03/G04 group exists]
  → starter_type === "MULTI_STARTER"?
      YES → handleMultiStarterLiveData()
              → isMultiMotorPayload()         [checks m1/m2 keys exist in group]
              → extractMultiMotorBlocks()     [splits into per-motor flat objects, merges p_v/pwr/llv/temp into each]
              → resolveMotorsFromPayload()    [matches each block to DB motor via motor_reference]
              → matched motors: full pipeline [validateLiveDataContent → prepareLiveDataPayload → saveLiveDataTopic]
              → unmatched/no motors: params only [insertParametersForUnmatchedMotor — motor_id=null, motor_reference stored, NO state/mode update]
      NO  → single-motor path (unchanged)
```

> See **§17** for the full implementation of `insertParametersForUnmatchedMotor` and what happens when no motors are assigned at all.

### What gets stored in `starter_parameters` per motor

| Column | Source |
|---|---|
| `starter_id` | device id |
| `motor_id` | matched motor's DB id — **`null` when no motor assigned** |
| `motor_reference` | `"m1"` or `"m2"` — **always stored from payload block** |
| `avg_voltage` / `line_voltage_*` | from merged motor block |
| `avg_current` / `current_*` | from merged motor block |
| `motor_state` | `m_s` field |
| `motor_mode` | `mode` field |
| `fault`, `alert_code` | `flt`, `alt` fields |
| `group_id` | `"G01"` etc. |
| `temperature` | `temp` (shared group field) |
| `power_present` | `pwr` (shared group field) |

---

## 10. MQTT Motor Control & Mode Change

### Motor Control ACK (T=31) — `mqtt-db-services.ts:942`

**`MULTI_STARTER` path:**
- `message.D` = `{ m1: { m_s: 1 }, m2: { m_s: 0 } }`
- Iterates `Object.keys(message.D)`
- Finds motor by `motor_reference` in `device.motors`
- Updates `motors.state` per motor
- Tracks runtime, writes activity log, sends notification per motor

**`SINGLE_STARTER` path (unchanged):**
- `message.D` = `1` (plain int)

### Mode Change ACK (T=32) — `mqtt-db-services.ts:1055`

**`MULTI_STARTER` path:**
- `message.D` = `{ m1: { mode: 1 }, m2: { mode: 2 } }`
- Iterates keys, maps `mode` int → `"MANUAL"/"AUTO"` via `controlMode()`
- Updates `motors.mode` per motor
- Writes activity log, sends notification per motor

**`SINGLE_STARTER` path (unchanged):**
- `message.D` = `1` (plain int)

---

## 11. Analytics — With & Without Motors

### `getStarterAnalytics` (`starter-services.ts:283`)

Always filters by `starter_id`. `motor_id` is optional. `motor_reference` filter is needed — see **§18** for full implementation.

```
GET /starters/:id/analytics?parameter=voltage&from=...&to=...
GET /starters/:id/analytics?parameter=voltage&from=...&to=...&motor_id=5
GET /starters/:id/analytics?parameter=voltage&from=...&to=...&motor_reference=m1
```

| Scenario | Filter to use | Behavior |
|---|---|---|
| No motors assigned yet, live data arrived | `motor_reference=m1` or `m2` | Returns parameters rows where `motor_id=null` and `motor_reference=m1/m2` |
| Motor assigned, query by motor | `motor_id=5` | Filters to that specific motor |
| Both motors, see combined | no filter | All parameters rows for the device |
| Motor deleted, history exists | `motor_id=5` (old id) | Still works — row is ARCHIVED not deleted |
| No motors, no data | any | Returns `[]` — no parameters rows exist yet |

> `motor_reference` filter is currently missing from `getStarterAnalytics`. **Backend change required — see §18.**

---

## 12. Settings — With & Without Motors

Settings are **device-level** — stored in `starter_settings` and `starter_settings_limits` by `starter_id` only. Motors are not involved.

### `publishDeviceSettings` (`settings-services.ts:210`)

Looks up `starterSettings` by `starter_id` → prepares config payload → publishes via MQTT.

| Scenario | Settings behavior |
|---|---|
| Device created, 0 motors | Settings row created at device add — publish works fine |
| Heartbeat received, 0 motors | `synced_settings_status === "false"` is checked on the device row — still triggers publish |
| Motor deleted | No effect on settings |

**No change needed.** Settings work the same regardless of motor count.

---

## 13. Logs & Activity Trail

| Event | Log type | Written by |
|---|---|---|
| Motor added | `MOTOR_ADDED` | `ActivityService.writeMotorAddedLog` |
| Motor updated | `MOTOR_UPDATED` | `ActivityService.writeMotorUpdatedLog` |
| Motor deleted | `MOTOR_DELETED` | `ActivityService.writeMotorDeletedLog` |
| Motor replaced (new) | `MOTOR_REPLACED` | `ActivityService.writeMotorReplacedLog` (new method) |
| Motor state change (MQTT) | `MOTOR_CONTROL_ACK` | `ActivityService.writeMotorAckLogs` |
| Motor mode change (MQTT) | `MOTOR_MODE_ACK` | `ActivityService.writeMotorAckLogs` |
| Live data saved | row in `starter_parameters` | `saveLiveDataTopic` |
| Motor runtime | row in `motors_run_time` | `trackMotorRunTime` |

### Viewing logs after motor deletion

All activity rows reference `motor_id` (the DB id), not `motor_reference`.  
The motor row stays in the DB with `status = "ARCHIVED"`.  
All log queries joining on `motors.id` still return rows.  
Frontend should handle `status === "ARCHIVED"` gracefully (e.g. label as "Deleted Motor").

---

## 14. Critical Query Fixes

### `getStarterByMacWithMotor` (`starter-services.ts:88`)

Called by every MQTT handler. Two fields are missing from the SELECT — without them all `MULTI_STARTER` branching is dead code at runtime.

**Add `starter_type` to columns:**
```ts
columns: {
  id: true,
  status: true,
  starter_type: true,   // ADD — currently undefined → MULTI_STARTER check always false
  ...
}
```

**Add `motor_reference` to motors relation:**
```ts
with: {
  motors: {
    columns: {
      id: true,
      name: true,
      state: true,
      mode: true,
      location_id: true,
      created_by: true,
      alias_name: true,
      motor_reference: true,   // ADD — currently undefined → all motors fall into unmatched bucket
    }
  }
}
```

---

## 15. All Changes Summary Table

| # | File | Change | Why |
|---|---|---|---|
| 1 | `starter-validations.ts` | Add `starter_type` to `vAddStarter` | API must accept device type at creation |
| 2 | `app-types.ts` | Add `starter_type` to `starterBoxPayloadType` | TypeScript interface missing the field |
| 3 | `starter-helper.ts` | Skip `motorDetails` when `MULTI_STARTER` | No auto-motor on multi-motor device create |
| 4 | `starter-services.ts` line 40 | Guard motor insert with `if (motorDetails)` | Crash prevention + multi-motor device skip |
| 5 | `starter-services.ts` `getStarterByMacWithMotor` | Add `starter_type` + `motor_reference` to SELECT | MQTT branching is dead code without these |
| 6 | `starter-services.ts` `starterConnectedMotors` | Add `motor_reference` + `starter_type` to query | Slot availability for frontend |
| 7 | `starter-handlers.ts` connected motors handler | Compute `available_slots` / `filled_slots` | Frontend needs to know which slots are free |
| 8 | `motor-validations.ts` | Add `starter_id` + `motor_reference` to `vAddMotor` | Manually assign motor to a specific slot |
| 9 | `motor-handlers.ts` `addMotorHandler` | Pass `starter_id` + `motor_reference`; block duplicate slot | Prevent two motors in the same slot |
| 10 | `motor-handlers.ts` `deleteMotorHandler` | Reset device only when last motor deleted; cancel schedules | Deleting m1 must not reset a device that still has m2 |
| 11 | `motor-handlers.ts` | New `assignMotorHandler` + `PATCH /:id/assign` route | Assign existing motor from pool to a device slot |
| 12 | `motor-handlers.ts` | New `detachMotorHandler` + `PATCH /:id/detach` route | Remove motor from device slot back to pool, preserve history |
| 13 | `motor-handlers.ts` | New `replaceMotorHandler` + `PATCH /:id/replace` route | Archive old motor, insert new in same slot, preserve history |
| 14 | `motor-routes.ts` | Add `PATCH /:id/assign`, `PATCH /:id/detach`, `PATCH /:id/replace` | Expose all three new motor lifecycle endpoints |
| 15 | `activity-service.ts` | New `writeMotorAssignedLog`, `writeMotorDetachedLog`, `writeMotorReplacedLog` | Audit trail for all motor lifecycle operations |

---

## 16. Motor Operations — Full Examples

### Setup used in all examples below

```
Device A  (id=10, starter_type="MULTI_STARTER")  — slots: m1, m2
Device B  (id=20, starter_type="MULTI_STARTER")  — slots: m1, m2
```

---

### ASSIGN

#### Case A — Device has no motors, assign m1

Device A slots before:
```
m1 → empty
m2 → empty
```

**Payload:** `POST /motors`
```json
{
  "name": "Pump 1",
  "hp": 5,
  "location_id": 3,
  "starter_id": 10,
  "motor_reference": "m1"
}
```

DB insert: `{ id:5, starter_id:10, motor_reference:"m1", status:"ACTIVE", state:0, mode:"AUTO" }`

Device A slots after:
```
m1 → Motor 5 (Pump 1) ✅
m2 → empty
```

`GET /starters/10/motors` response:
```json
{ "filled_slots": ["m1"], "available_slots": ["m2"] }
```

---

#### Case B — Assign m2

**Payload:** `POST /motors`
```json
{
  "name": "Pump 2",
  "hp": 5,
  "location_id": 3,
  "starter_id": 10,
  "motor_reference": "m2"
}
```

Device A slots after:
```
m1 → Motor 5 ✅
m2 → Motor 6 ✅
```

```json
{ "filled_slots": ["m1", "m2"], "available_slots": [] }
```

---

#### Case C — Try to assign m1 when already filled

**Payload:** `POST /motors`
```json
{
  "name": "Pump 3",
  "hp": 5,
  "location_id": 3,
  "starter_id": 10,
  "motor_reference": "m1"
}
```

**Response:** `409 Conflict — Motor slot already occupied`  
Nothing inserted. Guard in `addMotorHandler` blocks the insert.

---

### DETACH

Detach = remove motor from device slot, motor goes back to unassigned pool. Motor record stays ACTIVE. All history preserved. Slot becomes free.

**Payload:** `PATCH /motors/5/detach`

DB update: `UPDATE motors SET starter_id=null, motor_reference=null WHERE id=5`

Device A slots after:
```
m1 → empty  ← slot freed
m2 → Motor 6 ✅
```

Motor 5 state: `{ starter_id: null, motor_reference: null, status: "ACTIVE" }`

Motor 5 is now in the unassigned pool. Can be re-assigned to any device later.

```json
{ "filled_slots": ["m2"], "available_slots": ["m1"] }
```

---

### DELETE

Delete = motor is permanently ARCHIVED. Slot is freed. Historical data (parameters, runtime, logs) stays in DB tied to the old `motor_id`.

**Payload:** `DELETE /motors/5`

Transaction steps:
```
1. SET motors.status = "ARCHIVED" WHERE id=5
2. Count remaining active motors on starter_id=10
   → Motor 6 still exists → remaining = 1
   → DO NOT reset device (m2 still active)
3. Cancel active schedules for Motor 5
4. Write MOTOR_DELETED activity log
```

Device A slots after:
```
m1 → empty  (Motor 5 archived)
m2 → Motor 6 ✅
```

```json
{ "filled_slots": ["m2"], "available_slots": ["m1"] }
```

#### Delete last motor (Motor 6)

```
1. SET motors.status = "ARCHIVED" WHERE id=6
2. Count remaining → 0 (no motors left)
   → SET starter_boxes SET device_status="DEPLOYED", user_id=null WHERE id=10
3. Cancel schedules for Motor 6
4. Write MOTOR_DELETED log
```

Device A slots after:
```
m1 → empty
m2 → empty
device_status → "DEPLOYED"
user_id → null
```

---

### REPLACE

#### Case R1 — Replace hardware in the SAME slot on the SAME device

*Motor 5 on Device A m1 broke. New physical motor placed in same m1 slot.*

**Payload:** `PATCH /motors/5/replace`
```json
{
  "name": "Pump 1 New",
  "hp": 5,
  "location_id": 3
}
```

Transaction steps:
```
1. SET motors.status = "ARCHIVED" WHERE id=5
   → Motor 5 history (parameters, runtime, logs) fully preserved
2. INSERT new Motor 7:
   { starter_id:10, motor_reference:"m1", name:"Pump 1 New", status:"ACTIVE" }
3. Write MOTOR_REPLACED log (old_motor_id=5, new_motor_id=7)
```

Device A slots after:
```
m1 → Motor 7 (Pump 1 New) ✅  ← new motor, same slot
m2 → Motor 6 ✅
```

Future MQTT live data: `resolveMotorsFromPayload` matches `motor_reference="m1"` → picks up Motor 7 automatically. No device config change needed.

---

#### Case R2 — Move motor from Device A to Device B (Device B slot is empty)

*Motor 5 is on Device A m1. Device A is decommissioned. Move Motor 5 to Device B m1.*

This is **detach from A + assign to B**.

**Step 1 — Detach from Device A:** `PATCH /motors/5/detach`
```
Motor 5: { starter_id: null, motor_reference: null }
Device A: m1 → empty
```

**Step 2 — Assign to Device B:** `PATCH /motors/5/assign`
```json
{ "starter_id": 20, "motor_reference": "m1" }
```
```
Motor 5: { starter_id: 20, motor_reference: "m1" }
Device B: m1 → Motor 5 ✅
```

All of Motor 5's history is preserved. Future MQTT data on Device B now flows into Motor 5's records.

---

#### Case R3 — Move motor to Device B but Device B slot is already filled

*Motor 5 is on Device A m1. Device B m1 already has Motor 8.*

Trying to assign Motor 5 to Device B m1 directly → **`409 Conflict`**

Must free Device B's m1 slot first:

```
Step 1: Detach or Delete Motor 8 from Device B m1
        PATCH /motors/8/detach   (or DELETE /motors/8)
        → Device B m1 → empty

Step 2: Detach Motor 5 from Device A
        PATCH /motors/5/detach
        → Device A m1 → empty

Step 3: Assign Motor 5 to Device B m1
        PATCH /motors/5/assign  { starter_id: 20, motor_reference: "m1" }
        → Device B m1 → Motor 5 ✅
```

---

### DEVICE DELETED

When a device is archived, all its motors are also archived in the same transaction.

Transaction steps:
```
1. SET starter_boxes.status = "ARCHIVED" WHERE id=10
2. SET motors.status = "ARCHIVED"
   WHERE starter_id=10 AND status != "ARCHIVED"
   → Motor 5 archived, Motor 6 archived
3. Cancel active schedules for all motors on this device
4. Write STARTER_DELETED + MOTOR_DELETED logs
```

All historical data preserved:

| Table | State after device delete |
|---|---|
| `starter_boxes` | `status="ARCHIVED"` — row kept |
| `motors` | `status="ARCHIVED"` — rows kept |
| `starter_parameters` | Untouched — all live data history intact |
| `motors_run_time` | Untouched |
| `motor_status_history` | Untouched |
| `motor_schedules` | Active ones → `"ARCHIVED"` |

---

### Quick Reference Table

| Operation | Slot before | Slot after | Motor status | Device status |
|---|---|---|---|---|
| Assign m1 (empty slot) | empty | m1 filled | ACTIVE | unchanged |
| Assign m1 (slot taken) | m1 filled | m1 filled | no change | `409 Conflict` |
| Detach m1 | m1 filled | empty | ACTIVE, starter_id=null | unchanged |
| Delete m1 (m2 exists) | m1 filled | empty | ARCHIVED | unchanged |
| Delete m1 (last motor) | m1 filled | empty | ARCHIVED | DEPLOYED, user=null |
| Replace same slot | m1 filled | m1 filled | old=ARCHIVED, new=ACTIVE | unchanged |
| Move to Device B (empty slot) | A:m1 filled, B:m1 empty | A:m1 empty, B:m1 filled | ACTIVE | both unchanged |
| Move to Device B (filled slot) | B:m1 filled | blocked | no change | `409 Conflict` |
| Device deleted | any | all empty | all ARCHIVED | ARCHIVED |
