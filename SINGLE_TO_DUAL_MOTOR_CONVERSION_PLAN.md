# Single → Dual Motor Conversion — Implementation Plan

Converting an existing single-motor starter into a dual-motor one by adding a second motor.

Companion to `VERSIONED_PAYLOAD_IMPLEMENTATION_PLAN.md`, which left this as open item §14.4.

---

## 1. What the user does

A box was created with one motor. Later a second motor is physically wired in, and the Admin
Panel must reflect that: add motor M2, and from then on the box is a dual-motor starter that
receives `m1` **and** `m2` in every payload.

## 2. Two steps, not one

A dual-motor box has no V1.0 payload shape, so a box being converted must already be on V2.0.
The version switch and the motor addition are **separate requests, in this order**:

```
1. PATCH /starters/954/details      { "payload_version": "2.0" }
2. POST  /motors/starter/954        { "name": "Pump 2", "hp": 5, "location_id": 3 }
```

This is the same "change one, then the other" rule the version-switch guard already enforces
(`PAYLOAD_VERSION_MOTOR_CHANGE_NOT_ALLOWED`). Auto-promoting the version inside the add-motor
call was rejected: it would change the box's payload grammar as a side effect of what looks
like a data-entry action, and the two changes need to be confirmed against different facts —
the version against firmware, the motor count against what is physically wired.

Step 2 fails with a clear message if step 1 was skipped.

## 3. What step 2 must do

All in one transaction:

| # | Change | Why |
|---|---|---|
| 1 | Insert the motor with `starter_id`, `motor_index = 2`, `motor_reference = 'm2'` | `unique_starter_motor_index` guarantees m1/m2 in an ack map to exactly one motor |
| 2 | `motor_support_type = 'MULTIPLE_MOTORS'`, `starter_type = 'MULTI_STARTER'` | both are read as arity authorities in different places; leaving them to disagree is what produced the 5 broken boxes found during the version backfill |
| 3 | **Seed `multi_motor_config`** on the box's acknowledged settings row | the crux — see §4 |
| 4 | Seed `multi_motor_limits` on the limits row | so the per-motor screens have bounds to render |
| 5 | `synced_settings_status = 'false'` + `clearSettingsSyncAttempts` | the device is now running a payload with no `m2`; force a republish |
| 6 | Activity log | conversion is a config change worth an audit trail |

## 4. The crux — seeding `multi_motor_config`

A single-motor box stores its motor settings in the **flat** `starter_settings` columns
(`flc`, `f_dr`, `dr`, `drf`, `olr`, …). The V2.0 builder projects those into `m1` at publish
time, which is why single-motor V2.0 needed no data migration.

**That projection cannot express two motors.** One set of flat columns, two motors that need
independent FLC and independent current protection. So conversion is the one point where the
data genuinely has to be migrated:

```
multi_motor_config = {
  v_flt_en: 0,                       // no flat column exists; defaults to 0 (see §6)
  sd_time:  settings.start_time,     // flat star-delta column
  motors: [
    { motor_id: <existing>, motor_index: 1, motor_reference: 'm1',
      ...perMotorFields(flat settings),        // M1 keeps exactly what it has today
      acknowledgement: 'FALSE' },
    { motor_id: <new>,      motor_index: 2, motor_reference: 'm2',
      ...perMotorFields(starter_default_settings),   // M2 starts from global defaults
      acknowledgement: 'FALSE' },
  ],
}
```

**M1 keeps its current values.** Its block is built from the same flat columns that fed its
`m1` payload before the conversion, so nothing about the running motor changes. Only the
container changes — projected-at-publish becomes stored-in-JSON.

**M2 starts from `starter_default_settings`.** A newly wired motor has no history; the global
default row is the same source a brand-new box's settings come from. The admin edits M2's real
FLC afterwards through the normal settings screen.

**Both blocks are written `acknowledgement: 'FALSE'`.** The device has not seen either block in
this shape yet, and marking M1 pre-acknowledged would let a box be reported as synced while it
is still running a single-motor payload.

### Which row to write

Update the **existing acknowledged row** in place (`acknowledgement = 'TRUE'` and
`is_new_configuration_saved = 1`) rather than inserting a new one. That row is what
`publishMultiMotorDeviceSettings` reads as the source to publish; inserting a second "acked"
row instead would leave two candidates and make which one publishes depend on row ordering.

If the box has **no** acknowledged settings row, conversion still succeeds but there is nothing
to seed — the box will publish only once its settings are saved for the first time. Log it
loudly; this is precisely the state boxes 924–929 were found in.

### Why not project for dual as well

Rejected: it would require inventing a rule for where M2's values come from on every publish,
and any such rule is a guess. Storing them makes M2 editable, auditable, and independent —
which is the whole reason `multi_motor_config` exists.

## 5. After conversion

Nothing is pushed by the request. On the next heartbeat:

- **Settings** — `synced_settings_status = 'false'` and signal 2–40 triggers
  `publishDeviceSettings`. The box is now dual, so `isDualMotor` is true, the builder reads
  `multi_motor_config.motors[]`, and the device receives `m1` + `m2`.
- **Schedules** — unchanged for M1. M2 has none until schedules are created against it.

The device acks per motor (`D: { m1: 1, m2: 1 }`), `updateMultiMotorSettingsAck` flips both
blocks, and the box is marked synced only once **every** motor has acknowledged.

## 6. Decisions taken

**`v_flt_en` defaults to 0.** It exists only inside `multi_motor_config` — there is no flat
column to carry a single-motor box's value forward, so a converted box starts with voltage
faults disabled at the box level unless the admin sets it. Confirm the intended default with
firmware; 0 is the safe direction (matching the existing `{ v_flt_en: 0, sd_time: 0, motors: [] }`
fallback in `publishMultiMotorDeviceSettings`).

**Maximum two motors.** `vAddStarter` already caps `motors` at 2 and the payload grammar defines
only `m1`/`m2`. Adding a third is rejected.

**`motor_index` is fixed at 2, not "next free".** A converted box has exactly one existing motor
at index 1. Computing a max+1 would silently produce index 3 if data were inconsistent, and the
unique index would then reject it with a database error instead of a clear message.

**Conversion is one-way here.** Removing a motor to go back to single is out of scope: it needs
a decision about what happens to M2's schedules, runtime history and parameter rows. The
existing `DELETE /motors/:id` archives a motor but does **not** revert the box's
`motor_support_type` — so a box that loses its second motor stays marked dual. Worth fixing
separately; flagged in §8.

## 7. Testing

- Convert a 1.0 box → rejected with the version message; box unchanged.
- Convert a 2.0 single box → motor created at index 2 with reference `m2`; box flips to
  `MULTIPLE_MOTORS` + `MULTI_STARTER`; `synced_settings_status` cleared.
- **M1 values are preserved byte-for-byte**: the `m1` block after conversion equals the `m1`
  block the projection produced before it. This is the regression that matters — a converted
  box must not change how its running motor behaves.
- M2 block equals the global defaults.
- Converting an already-dual box → rejected, no partial write.
- A box with no acknowledged settings row → conversion succeeds, warning logged, no config seeded.
- Next heartbeat publishes `m1` + `m2`; a `{ m1: 1, m2: 1 }` ack marks the box synced; a
  `{ m1: 1 }` ack alone does not.
- Transaction rollback: if the settings seed fails, no motor row is left behind.

## 8. Risks

| Risk | Mitigation |
|---|---|
| M1's behaviour changes during conversion | Its block is copied from the same flat columns that fed its payload; asserted in tests |
| Box left half-converted (motor added, config not seeded) | Single transaction covering motor, box flags and settings |
| M2 runs on default FLC on real hardware | Blocks are seeded `acknowledgement: 'FALSE'`, so the box is not reported synced until the admin's real values are acked |
| Conversion on a box that never synced | Succeeds, logs loudly, seeds nothing — same state as boxes 924–929 |
| Deleting the second motor later leaves the box marked dual | Known gap (§6), out of scope |
| `v_flt_en` default is wrong | Confirm with firmware; 0 matches the existing fallback |
