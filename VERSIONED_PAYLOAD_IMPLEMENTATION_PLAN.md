# Versioned Device Payloads — Implementation Plan

Status: proposal. Nothing here is implemented yet.

Scope: **all** packet families — motor control, mode change, scheduling, device settings, default/admin
settings, test run, and their acks. Not settings alone.

---

## 1. The requirement

From the client note:

> **V1.0**: All old deployed boards are V1.0 and should continue using the `Single Motor Starter
> V1.0_20_11_25` payload format. These payloads do not contain `m1` or `m2` objects.
>
> **V2.0**: All newly manufactured boards are V2.0 and should use the `ESP32_STM32_Payload_Exchange`
> format, irrespective of whether they are configured as single or dual motor starters. If configured as
> Single Motor Starter, include only the `m1` object. If configured as Dual Motor Starter, include both
> `m1` and `m2`.

| Version | Motors | Grammar |
|---|---|---|
| **1.0** | single only | no `m1` / `m2` anywhere — frozen, untouched |
| **2.0** | single | `m1` only |
| **2.0** | dual | `m1` + `m2` |

Version is chosen in the Admin Panel when the device is added, and applies to **every** operation.

**1.0 is never modified by this work.** No new key, no reordering, no changed unit, in any family. The
version column exists so that 2.0 can move without 1.0 having to.

**1.0 + dual does not exist.** Any box with two motors is 2.0 by definition. §6 makes that unrepresentable.

---

## 2. ⚠️ Three contradictions between the note and the running code

These need a decision from the client before Phase 1. I have not designed around them silently.

### 2.1 We already send `m1` to V1.0 boards — control and mode

`buildMotorControlPayload` (`src/helpers/motor-control-payload-helper.ts:46`) and
`buildModeControlPayload` (`src/helpers/mode-control-payload-helper.ts:18`) emit `D: { "m1": 1 }` for
**every** box, including old single-motor ones. That contradicts "V1.0 payloads do not contain m1 or m2".

It evidently works in the field — but commit `3fd5972` records that those same boards **ack with a bare
scalar** (`{"T":32,"S":187,"D":0}`), which is why `normalizeDeviceAckD` exists. So V1.0 firmware is
asymmetric: it tolerates an `m1` command and replies with a scalar.

**Question for the client:** is the V1.0 control/mode command genuinely `D: 1` in the
`Single Motor Starter V1.0_20_11_25` document, and current firmware is simply lenient? If so, we are
relying on undocumented leniency, and the honest fix is to send `D: 1` to 1.0 boxes.

**Recommendation: do not change it in this project.** It works, and the instruction is to leave 1.0 alone.
Record it as known drift, fix it separately if the client confirms the document says otherwise.

### 2.2 We already send `m1` to V1.0 boards — schedules

`buildDeviceSyncPayloads` (`src/helpers/motor-schedule-payload-helper.ts:672`) sends single-motor boxes
`D: { idx, last, sch_cnt, plr, m1: [ ... ] }` — an `m1` **array**. Multi-motor boxes get
`m1: { sch_cnt, sch: [...] }` — an `m1` **object**. Same contradiction as §2.1, plus a second problem:
`m1` means two different types depending on the box.

**Recommendation:** 2.0 uses the object form for both single and dual — one type for one key. 1.0 keeps the
array form untouched.

### 2.3 Test run has no packet at all

There is no test-run MQTT payload in the codebase. `test_run_status` is a DB column on `motors`
(`src/database/schemas/motors.ts:27`) updated through an API handler
(`src/handlers/motor-handlers.ts:380`); nothing is published to the device.

**Question for the client:** is test run a **new** V2.0 packet type, or does the Admin Panel's "test run"
simply issue a normal T:1 motor control and record the outcome? The plan cannot specify a payload for it
without an answer. It is carried as an open item in §12, not as a designed family.

---

## 3. ⚠️ What I need from the spec sheet

The Zoho sheet you linked redirects to a login, so I could not read it. Everything marked **UNCONFIRMED**
below is derived from the existing multi-motor code, not from `ESP32_STM32_Payload_Exchange`.

Please paste, or export, these from the sheet:

1. **T:1 motor control** and **T:2 mode change** — exact V2.0 `D` shape, single and dual.
2. **T:3 scheduling** — exact V2.0 `D` shape; confirm `m1: { sch_cnt, sch: [] }` for single motor.
3. **T:4 settings** — the authoritative V2.0 `dvc_c` key list, and specifically whether `paminf`, `pamaxf`,
   `lvr`, `hvr`, `pr_flt_en` belong at box level (§9.1).
4. **Units for `drf` / `olf` / `lrf` / `olr` / `lrr` in V2.0** — percentage or absolute amps (§9.2). This is
   the highest-risk unknown in the document.
5. **`str_type` integer codes** for `STAR_RELAY` / `CONTACTOR` / `STAR_DELTA`.
6. **Test run** — packet type and shape, if it is a packet (§2.3).
7. **T:13 admin/default settings** — whether V2.0 restructures it into `m1`/`m2` (§8.5).
8. **Ack shapes** for every one of the above.

Until 1–8 land, Phases 1–4 in §13 are still safe to build: they add the column and the routing without
changing a single byte on the wire.

---

## 4. The version column

```sql
CREATE TYPE payload_version AS ENUM ('1.0', '2.0');

ALTER TABLE starter_boxes
  ADD COLUMN payload_version payload_version NOT NULL DEFAULT '1.0';
```

`src/database/schemas/starter-boxes.ts`, beside the existing enums at lines 10-14:

```ts
export const payloadVersionEnum = pgEnum("payload_version", ["1.0", "2.0"]);
// in the table body, next to motor_support_type:
payload_version: payloadVersionEnum().notNull().default("1.0"),
```

**Default 1.0, deliberately** — an unset, unknown or newly-restored box must get the oldest, safest format.
Never infer "new firmware" from missing information.

String enum, not numeric: `2.1` / `3.0` slot in later without a type change, and `2.0 == 2` can never
silently compare equal.

### Backfill

```sql
UPDATE starter_boxes
   SET payload_version = '2.0'
 WHERE motor_support_type = 'MULTIPLE_MOTORS'
    OR starter_type = 'MULTI_STARTER';
```

Every dual box becomes 2.0 — already the format it receives. Everything else stays 1.0. **Behaviour-neutral
on migration day.** Both columns are checked because they can disagree (§14.1); log the count where they
do, that list needs manual review.

---

## 5. One resolver, every family

The version must be read the same way everywhere, so it is resolved once and passed down:

```ts
// src/helpers/payload-version-helper.ts
export type PayloadVersion = "1.0" | "2.0";

export function payloadVersionOf(starter: { payload_version?: string | null }): PayloadVersion {
  return starter.payload_version === "2.0" ? "2.0" : "1.0";   // anything unknown → 1.0
}

export function motorSlotsOf(starter): number[] {
  return starter.motor_support_type === "MULTIPLE_MOTORS" ? [1, 2] : [1];
}
```

Every builder takes `starter` and branches once at the top. No builder infers version from `starter_type`,
motor count, or the presence of `multi_motor_config` — those are the guesses this column replaces.

---

## 6. `1.0 + dual` must be unrepresentable

- **Create and update**: reject the pair with a 422.
- **Adding a second motor to a 1.0 box**: auto-promote to 2.0 and force re-sync, or reject — product
  decision (§14.4). The box must not stay 1.0.
- **At publish**: treat it as a bug — log and use the 2.0 dual builder rather than publish a payload that
  silently omits `m2`. A dropped motor is worse than an unexpected key.
- **DB constraint**, added after the backfill and after the §4 disagreement list is cleared:

```sql
ALTER TABLE starter_boxes ADD CONSTRAINT payload_version_motor_support_valid
  CHECK (payload_version = '2.0' OR motor_support_type = 'SINGLE_MOTOR');
```

---

## 7. Admin Panel: selecting and switching

### Create — `POST /starters`

`vAddStarter` (`src/validations/schema/starter-validations.ts:20-22`):

```ts
payload_version: v.optional(v.picklist(["1.0", "2.0"], "Invalid payload version")),
```

`prepareStarterData` (`src/helpers/starter-helper.ts:39`):

```ts
const payload_version = starterFields.payload_version ?? (isMultiMotor ? "2.0" : "1.0");
```

The Add Device screen shows the dropdown next to the motor-count control, with 1.0 disabled once two
motors are entered.

### Switch — `PATCH /starters/:id/details`

Same optional field on `vUpdateStarterDetails`. A version change **must force a full re-sync** in the same
transaction:

```ts
{ payload_version: next, synced_settings_status: "false" }
```

plus `clearSettingsSyncAttempts(starterId)`, so the bounded-retry counter from commit `63c4cf1` doesn't
suppress the republish. Schedules must be re-pushed too — mark the starter's synced schedules for resend,
or the device keeps the old-format schedule table.

Switching is valid **both ways, at any time**, subject to §6. Single-motor boxes go 1.0 ↔ 2.0 freely; dual
boxes can never be 1.0.

### Read

Return `payload_version` from every endpoint that exposes `starter_type` / `motor_support_type`:
`GET /starters/:id`, the starter list, `GET /starters/mobile`.

---

## 8. The payloads, family by family

All publish to `peepul/<mac_or_pcb>/cmd` — `mac_address` when `device_allocation === "false"`, else
`pcb_number` (`src/services/db/mqtt-db-services.ts:1496`). Acks arrive on `peepul/<mac_or_pcb>/status`
with `S` echoed.

### 8.1 — T:1 motor control → T:31 ack

**1.0 (today, frozen)** — see §2.1, this contains `m1` despite the note:

```json
{ "T": 1, "S": 40112, "D": { "m1": 1 } }
```
Ack: `{ "T": 31, "S": 40112, "D": 1 }` — bare scalar.

**2.0 single — UNCONFIRMED**

```json
{ "T": 1, "S": 40113, "D": { "m1": 1 } }
```
Ack: `{ "T": 31, "S": 40113, "D": { "m1": 1 } }`

**2.0 dual — UNCONFIRMED**

```json
{ "T": 1, "S": 40114, "D": { "m1": 1, "m2": 0 } }
```
Ack: `{ "T": 31, "S": 40114, "D": { "m1": 1, "m2": 0 } }`

`D` carries only the motors being commanded — one target gives one key. Values: `0` off, `1` on.

Code: `buildMotorControlPayload` gains a version parameter. The 2.0 branch is what it does today; the 1.0
branch is byte-identical to today until §2.1 is answered.

### 8.2 — T:2 mode change → T:32 ack

Identical structure to 8.1, values `0` MANUAL / `1` AUTO / `2` SCHEDULE via `modeToControlCode`.

**1.0 (today, frozen)**: `{ "T": 2, "S": 40211, "D": { "m1": 2 } }`, ack `{ "T": 32, "S": 40211, "D": 2 }`

**2.0 single — UNCONFIRMED**: `{ "T": 2, "S": 40212, "D": { "m1": 2 } }`, ack `D: { "m1": 2 }`

**2.0 dual — UNCONFIRMED**: `{ "T": 2, "S": 40213, "D": { "m1": 2, "m2": 1 } }`, ack `D: { "m1": 2, "m2": 1 }`

### 8.3 — T:3 scheduling → T:33 ack

**1.0 (today, frozen)** — `m1` is a flat **array**:

```json
{
  "T": 3, "S": 30011,
  "D": {
    "idx": 1, "last": 1, "sch_cnt": 2, "plr": 30,
    "m1": [
      { "id": 1, "cid": 1, "sd": 260805, "ed": 260805, "st": 600, "et": 800,
        "st_ep": 1786012800, "ed_ep": 1786020000, "en": 1, "pwr_rec": 1, "dow": 62 },
      { "id": 2, "cid": 2, "sd": 260806, "ed": 260806, "st": 1800, "et": 1900,
        "st_ep": 1786142400, "ed_ep": 1786146000, "en": 1, "pwr_rec": 0 }
    ]
  }
}
```

**2.0 single — UNCONFIRMED** — `m1` becomes an **object**, matching dual (§2.2):

```json
{
  "T": 3, "S": 30012,
  "D": {
    "idx": 1, "last": 1, "sch_cnt": 1, "plr": 30,
    "m1": { "sch_cnt": 2, "sch": [ { "id": 1, "cid": 1, "…": "…" }, { "id": 2, "cid": 2, "…": "…" } ] }
  }
}
```

**2.0 dual — UNCONFIRMED** — today's multi-motor shape:

```json
{
  "T": 3, "S": 30013,
  "D": {
    "idx": 1, "last": 1, "sch_cnt": 2, "plr": 30,
    "m1": { "sch_cnt": 2, "sch": [ { "id": 1, "…": "…" }, { "id": 2, "…": "…" } ] },
    "m2": { "sch_cnt": 1, "sch": [ { "id": 3, "…": "…" } ] }
  }
}
```

Top-level `sch_cnt` means **schedule count** in 1.0 and **motor-group count** in 2.0 — an existing wart,
preserved, and worth confirming against the sheet.

Schedule item fields (`toCompactSchedule`, `motor-schedule-payload-helper.ts:531`): `cid` device slot 1–15,
`sd`/`ed` YYMMDD, `st`/`et` HHMM, `st_ep`/`ed_ep` epoch seconds, `en`, `pwr_rec`, optional `dow` bitmask,
plus `cy`/`on`/`off` for CYCLIC. `id` **must** be the absolute device slot — the partial-ack bitmask
references those slots.

Ack T:33 is a slot bitmask, unchanged by version, but confirm whether 2.0 returns it per motor.

### 8.4 — T:4 device settings → T:34 ack

**1.0 (today, frozen)** — `prepareDeviceConfigurationPayload`, twenty flat keys, no motor block:

```json
{
  "T": 4, "S": 48213,
  "D": { "dvc_c": {
    "allflt_en": 1, "flc": 5.5, "as_dly": 5,
    "ipf": 0, "lvf": 340, "hvf": 500, "vif": 10,
    "paminf": 100, "pamaxf": 130, "lvr": 380, "hvr": 460,
    "drf": 0.55, "olf": 0.28, "lrf": 0.28, "opf": 0.5, "cif": 0.5,
    "olr": 1.65, "lrr": 1.65, "cir": 30, "pr_flt_en": 0
  } }
}
```
Ack: `{ "T": 34, "S": 48213, "D": 1 }`

`drf`/`olf`/`lrf`/`olr`/`lrr` go out as **absolute amps** — stored percentage converted via
`(field / 100) * flc`, 2 dp. With `flc: 5.5`: stored `10` → `0.55`, `5` → `0.28`, `30` → `1.65`. `cir` is
**not** converted.

**2.0 single — UNCONFIRMED** — box fields plus one `m1`; `flc` moves inside:

```json
{
  "T": 4, "S": 51907,
  "D": { "dvc_c": {
    "allflt_en": 1, "as_dly": 5,
    "ipf": 0, "lvf": 340, "hvf": 500, "vif": 10,
    "paminf": 100, "pamaxf": 130, "lvr": 380, "hvr": 460, "pr_flt_en": 0,
    "v_flt_en": 1, "sd_time": 10,
    "m1": {
      "flt_en": 1, "flc": 5.5,
      "f_dr": 30, "f_ol": 130, "f_lr": 400, "f_opf": 0.5, "f_ci": 25,
      "dr": 40, "ol": 120, "lr": 350, "ci": 20,
      "drf": 10, "olf": 5, "lrf": 5, "opf": 0.5, "cif": 0.5,
      "olr": 30, "lrr": 30, "cir": 30
    }
  } }
}
```
Ack: `{ "T": 34, "S": 51907, "D": { "m1": 1 } }`

**2.0 dual — UNCONFIRMED** — same, with `m2` added (`"flc": 7.2` etc.).
Ack: `{ "T": 34, "S": 51908, "D": { "m1": 1, "m2": 1 } }`

### 8.5 — T:13 admin / default settings → ack TBC

`prepareStmAtmelSettingsData` (`src/helpers/settings-helpers.ts:442`) builds the full admin payload —
`dvc_c` plus calibration, MQTT and frequency blocks. It has **no multi-motor variant**: dual boxes get the
same flat shape today.

If V2.0 restructures this into `m1`/`m2` it needs the same treatment as 8.4, and the per-motor split has
to be specified — **item 7 in §3**. If it stays flat in V2.0, this family needs no work at all, which is
the outcome to hope for.

### 8.6 — T:10 device info → T:39, and other motorless packets

`{ "T": 10, "S": 1234, "D": 1 }` — no motor dimension, no version split. Same for live-data request (T:5),
power info (T:8), device reset (T:52). **Out of scope**; listed so the audit is complete.

### 8.7 — Test run

No packet exists (§2.3). Blocked on the client.

---

## 9. Settings: two things the sheet must settle

### 9.1 Five keys today's 2.0 payload drops

Comparing the two settings builders, the current multi-motor `dvc_c` is **missing five box-level keys**
that 1.0 sends: `paminf`, `pamaxf`, `lvr`, `hvr`, `pr_flt_en`. (`flc` and the current-fault keys are not in
that list — they legitimately moved into the motor blocks.)

Invisible today, because no box has ever moved between shapes. Under this plan a single-motor box **can**
move, and on 1.0 → 2.0 it would silently stop receiving voltage recovery and primary-fault config — a
functional regression, not a formatting one. §8.4's 2.0 payloads include all five.

Consequence: existing dual boxes, backfilled to 2.0, would **start** receiving five keys they don't get
today. That is a real change to real devices, which is why it is isolated in its own rollout phase behind
firmware sign-off. If firmware can't accept them on dual boxes, emit them only for `SINGLE_MOTOR` — ugly,
but it keeps 1.0 → 2.0 lossless for the case being asked for.

### 9.2 Percentage vs amps — the highest-risk unknown

1.0 converts `drf`/`olf`/`lrf`/`olr`/`lrr` to amps. The existing 2.0 dual builder sends stored
percentages. The 2.0 single projection must pick one.

Recommendation: match the 2.0 dual builder, since firmware parsing `m1` on a single box is the same family
that parses `m1` on a dual box. **Confirm before merging.** Wrong here mis-trips motors silently — a stored
`30` sent where `1.65` was expected is a plausible number, not an obvious error.

---

## 10. Where per-motor values come from

**Dual**: `starter_settings.multi_motor_config.motors[]`, keyed to live `motor_index` via
`motorIndexByMotorId`, exactly as today.

**2.0 single**: there is no `multi_motor_config` — a single-motor box stores motor settings in the **flat
columns**. So 2.0 single **projects the flat columns into `m1` at publish time**:

```ts
function motorBlocksFor(settings, starter, motorIndexByMotorId) {
  if (starter.motor_support_type === "MULTIPLE_MOTORS") {
    return (settings.multi_motor_config?.motors ?? [])
      .map(m => ({ index: motorIndexByMotorId.get(m.motor_id), values: perMotorFields(m) }))
      .filter(b => b.index !== undefined);     // stale motor_id: skip, never send a wrong index
  }
  return [{ index: 1, values: perMotorFields(settings) }];   // flat columns → slot 1
}
```

`perMotorFields` picks the same nineteen keys from either source, so the block is identical in shape
whichever fed it.

**Why projection, not migration.** Writing a `multi_motor_config` for single-motor boxes on switch was
rejected: switching back would lose data (two sources of truth, one goes stale), the save path would need
version-aware write logic, and rollback stops being free. With projection, a version switch needs **no data
change at all** — only a republish.

---

## 11. Acks

Drive the *expectation* from the box, because the current code guesses from shape
(`src/services/db/mqtt-db-services.ts:1515`) and that guess breaks the moment a box that always acked `D: 1`
starts acking `D: { m1: 1 }`.

| Version | Motors | Expected ack `D` |
|---|---|---|
| 1.0 | single | scalar — `1` |
| 2.0 | single | `{ "m1": 1 }` — scalar also accepted |
| 2.0 | dual | `{ "m1": 1, "m2": 1 }` |

Keep the shape check as a **fallback, not the primary**: when the received shape contradicts the recorded
version, trust the device, resolve the ack anyway, and log once with the starter id. Field reality beats our
column — an unresolvable ack means a box that republishes forever.

`normalizeDeviceAckD` (`src/helpers/motor-control-payload-helper.ts:32`) already folds a scalar into
`{ m1: D }` and is the right tool for "scalar also accepted". It needs no change.

For 2.0 single settings acks, `updateMultiMotorSettingsAck` writes into `multi_motor_config.motors[]`, which
a single-motor box lacks. Route 2.0 single acks to `updateLatestStarterSettings` after normalising
`{m1: 1}` → acked; that keeps the flat row as the source of truth end to end, consistent with §10.

This also fixes a live bug: starter 951 is `MULTI_STARTER` but acks with a scalar, so
`updateMultiMotorSettingsAck` never runs and both motors sit at `acknowledgement: "FALSE"` permanently. The
fallback honours that scalar.

---

## 12. Family status summary

| Family | 1.0 | 2.0 single | 2.0 dual | Work |
|---|---|---|---|---|
| T:1 control | `{m1}` today (§2.1) | `{m1}` | `{m1,m2}` | version param; 1.0 branch frozen |
| T:2 mode | `{m1}` today (§2.1) | `{m1}` | `{m1,m2}` | version param; 1.0 branch frozen |
| T:3 schedule | `m1: []` array | `m1: {}` object | `m1,m2: {}` | version param; unify `m1` type in 2.0 |
| T:4 settings | flat | `m1` object | `m1,m2` objects | new 2.0 builder + projection (§10) |
| T:13 admin | flat | ? | ? | blocked — §3 item 7 |
| Test run | none | ? | ? | blocked — §2.3 |
| T:10/5/8/52 | scalar | scalar | scalar | none |

---

## 13. Rollout

| Phase | Work | Behaviour change |
|---|---|---|
| 1 | Enum + column, default `1.0`, backfill dual → `2.0`, review disagreement list | **none** |
| 2 | `payloadVersionOf` helper; expose in responses; accept on create/update; reject `1.0 + dual` | **none** |
| 3 | Thread `starter` into all four builders; each branches on version; **every branch byte-identical to today** | **none — gated on golden diff** |
| 4 | DB check constraint (§6) once the disagreement list is clear | **none** |
| 5 | Version switch forces settings re-sync **and** schedule re-push (§7) | switching takes effect |
| 6 | Version-aware ack expectation with shape fallback (§11) | fixes stuck per-motor acks |
| 7 | 2.0 settings: `m1` projection for single motor (§10) | reachable only by 2.0 boxes |
| 8 | 2.0 settings: five box-level keys (§9.1) | **dual boxes get five new keys** — firmware sign-off |
| 9 | 2.0 schedules: `m1` object form for single motor (§2.2) | 2.0 single boxes only |
| 10 | Pilot **one** single-motor box on 2.0; verify every family against firmware | that box only |
| 11 | Stranded 2.0-only settings keys — `step_dly`, `tf_time`, `str_type`, trip timings | 2.0 boxes |
| 12 | Roll out 1.0 → 2.0 per box, on request | per box |

Phases 1–6 are inert on the wire: the system behaves exactly as today, but every decision is driven by an
explicit column. **Phase 3 is the one to guard** — before it merges, diff every builder's output against
current behaviour across real rows, for both versions and both motor counts, and fail the build on any
difference.

Phase 8 is the first phase that changes a real device's payload, and it changes it for **dual** boxes. Do
not ship it with Phase 3.

No bulk flip. Single-motor boxes move to 2.0 one at a time, after their firmware is confirmed.

---

## 14. Decisions this forces

### 14.1 `starter_type` vs `motor_support_type`

Both encode single-vs-dual, both derive from motor count at creation, and only `starter_type` accepts an
override — so they can disagree. This plan makes **`motor_support_type`** the authority: it is the semantic
name, it is what motor control (`src/handlers/motor-handlers.ts:159`) and schedule sync
(`src/helpers/schedule-sync-helper.ts:100`) already read, and it maps to the Admin Panel's single/dual
choice. Settings publish currently reads `starter_type` and must be moved.

Follow-up, not blocking: drop `starter_type` or make it a pure alias. Doing it inside this change would
confound the Phase 3 byte-identical check.

### 14.2 Per-family versions?

One column assumes firmware ships all families at one version. If a board could have V2.0 settings and V1.0
schedules, this becomes `settings_payload_version`, `schedule_payload_version`, … **Confirm before
Phase 1** — splitting one column after boxes are marked is a migration; starting with one and never needing
more costs nothing. The client note implies one version per board, which is what this plan assumes.

### 14.3 Who sets the version

Admin picks it at creation and can change it later. A future T:39 device-info ack could report firmware
capability and set the column itself — right long-term answer, compatible with this design, not in scope.

### 14.4 Adding a second motor to a 1.0 box

Auto-promote to 2.0, or reject until the version is changed? The box must not remain 1.0 either way.

---

## 15. Testing

- **Golden payload files** for every cell of §12 — settings row / schedule set / control target in, exact
  JSON out. Unexpected *added* keys are the dangerous failure for constrained firmware, and only a golden
  file catches them. The 1.0 goldens are captured from current code **before** Phase 3 and must never change.
- **2.0 single projection**: flat columns in, `m1` block out, all nineteen keys asserted, including the unit
  convention §9.2 settles on.
- **`1.0 + dual` unreachable**: rejected on create, on update, by the constraint, and — if forced into the
  DB — never publishes a payload missing `m2`.
- **Default safety**: a box with no version produces 1.0 output in every family.
- **Switch round-trip**: 1.0 → 2.0 → 1.0 on a single-motor box returns byte-identical 1.0 payloads in every
  family, and each switch clears `synced_settings_status`, the attempt counter, and schedule sync state.
- **Ack matrix**: all three rows of §11 per family, plus both mismatch directions, asserting the ack still
  resolves and logs once.
- **Schedule slots**: `id` remains the absolute device slot (1–15) in both formats — a regression here
  overwrites schedules on the device.
- **Stale `motor_id`**: a `multi_motor_config` entry whose motor was reassigned is skipped, not sent with a
  wrong index.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| A 1.0 board receives 2.0 keys and rejects the **whole** payload | 2.0 keys exist only in 2.0 branches; default 1.0; goldens gate 1.0 output |
| Percentage-vs-amps mismatch in projected `m1` | §9.2 settled with firmware before coding; asserted in goldens; wrong here mis-trips motors silently |
| 1.0 → 2.0 drops `paminf`/`pamaxf`/`lvr`/`hvr`/`pr_flt_en` | §9.1; Phase 8 isolates the change for sign-off |
| Building 2.0 from guessed shapes instead of the spec | Everything UNCONFIRMED is listed in §3; Phases 1–6 don't depend on it |
| A dual box ends up on 1.0 and loses `m2` | Rejected at API, DB constraint, publish-time fallback (§6) |
| Version switch leaves stale schedules on the device | Switch re-pushes schedules, not just settings (§7); covered in §15 |
| Ack stops resolving after a switch, box republishes forever | Shape fallback trusts the device (§11); publish lock and bounded retries cap the damage |
| Phase 3 silently alters an existing payload | Golden diff across real rows, every family, gated before merge |
| `starter_type` / `motor_support_type` disagree | Backfill treats either as dual and logs the list; arity reads `motor_support_type` (§14.1) |
