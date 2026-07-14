# Multi-Motor Manual Control — Implementation Plan

## 1. Problem statement

A starter box can already host more than one motor (`starter_boxes.motor_support_type = MULTIPLE_MOTORS`, `motors.motor_index`, `motors.starter_id` is 1-to-many already). The frontend "Multi-Motor Demo" screen lets a user see M1/M2 (and eventually M3+) per box and toggle their mode independently. We now need **real manual ON/OFF control** for these motors, where the user can act on **one motor or several at once**, published to the device in a single MQTT message and acknowledged in a single MQTT message:

Publish (backend → device):
```json
{ "T": 1, "S": 89, "D": { "m1": 1, "m2": 1 } }
```
Ack (device → backend):
```json
{ "T": 31, "S": 89, "D": { "m1": 1, "m2": 1 }, "ct": 1767098550 }
```

`T:1` (`REQUEST_TYPES.MOTOR_CONTROL`) and `T:31` (`ACK_TYPES.MOTOR_CONTROL_ACK`) already exist as constants in `src/helpers/packet-types-helper.ts`, but **no code publishes `T:1` today**, and the existing `T:31` handler (`motorControlAckHandler`, `src/services/db/mqtt-db-services.ts:1151-1220`) hardcodes `validMac.motors[0]` and treats `message.D` as a scalar `0/1`. Today, `PATCH /motors/:id` (`src/handlers/motor-handlers.ts:65-120`) only writes `motors.state` to the DB directly — it never talks to the device. Everything below is new or a rework of that handler.

## 2. Design decision: synchronous publish-and-wait, no persisted "PENDING forever" state

We just fixed a bug where schedules could get stuck in `PENDING` because the evaluator that would time them out was never invoked on the read path. To avoid reproducing that class of bug here, **motor control will not introduce a new long-lived "pending" DB status**. Instead we reuse the exact retry/ack pattern already proven for schedule sync (`publishMultipleTimesInBackground` / `waitForAck` / `pendingAckMap` in `src/helpers/settings-helpers.ts` and `src/helpers/ack-tracker-hepler.ts`):

- Publish `T:1`, wait up to ~30s (3 attempts × 10s, same constants as schedule sync) for a matching `T:31` ack on the same MAC/PCB and same `S`.
- Return the **final** result (`ACKED` / `TIMEOUT`) synchronously in the HTTP response.
- No new "commands" table, no cron to sweep stale rows, no orphaned pending state — the frontend gets a definitive answer within ~1s typically, worst case ~30s.

This is simpler than persisting a pending-command row and is consistent with how schedule sync already behaves.

## 3. Backend changes

### 3.1 Payload builder (new)

New helper, e.g. `src/helpers/motor-control-payload-helper.ts`:

```ts
export function buildMotorControlPayload(
  motorTargets: { motor_index: number; state: 0 | 1 }[]
): { T: 1; S: number; D: Record<string, 0 | 1> } {
  const D: Record<string, 0 | 1> = {};
  for (const t of motorTargets) D[`m${t.motor_index}`] = t.state;
  return { T: 1, S: randomSequenceNumber(), D };
}
```

- Only the motors the user actually selected go into `D` — a single-motor request produces `{ "m1": 1 }`, a multi-motor request produces `{ "m1": 1, "m2": 0 }` (independent target states per motor are supported; the sample payload happens to send both as `1`, but nothing requires them to match).
- Reuses `randomSequenceNumber()` (`src/helpers/mqtt-helpers.ts:71`) for `S`, exactly like schedule sync's `T:3` payload.

### 3.2 Publish + wait (new)

Add a `sendMotorControlCommand(starter, motorTargets)` alongside `publishMultipleTimesInBackground` in `settings-helpers.ts`, following the same shape (publish via `publishData`, `waitForAck` on the starter's MAC/PCB key + `S`). Reuse `publishData`/topic logic as-is (`peepul/<mac-or-pcb>/cmd`) — no topic changes needed, only the payload differs.

### 3.3 REST endpoint (new — unifies single & multi)

`POST /motors/starter/:starterId/control`

```json
{
  "motors": [
    { "motor_id": 101, "state": 1 },
    { "motor_id": 102, "state": 1 }
  ]
}
```

- A single-motor toggle is just this same endpoint with a 1-element array — **one code path for both cases**, which is what was asked for.
- Handler resolves each `motor_id` → `motor_index` (already stored on the `motors` row), validates all motors belong to `starterId` and are not `ARCHIVED`, builds the payload (3.1), calls `sendMotorControlCommand` (3.2), and returns per-motor ack results:

```json
{
  "status": "ACKED",
  "results": [
    { "motor_id": 101, "motor_index": 1, "requested_state": 1, "acked": true },
    { "motor_id": 102, "motor_index": 2, "requested_state": 1, "acked": true }
  ]
}
```

- `status` is `ACKED` (all requested motors confirmed), `PARTIAL_ACK` (device acked only some of the requested `m<N>` keys — see 3.4), or `TIMEOUT` (no ack within the retry window).
- **Recommendation**: once this endpoint exists, stop honoring `state` in `PATCH /motors/:id` (`motor-handlers.ts:82`) — today it silently flips `motors.state` in the DB with no device command at all, which is a latent correctness gap. Keep `PATCH /motors/:id` for `name`/`hp`/`mode` only; route all state changes through the new endpoint.

### 3.4 Ack handler rework (`motorControlAckHandler`, `mqtt-db-services.ts:1151-1220`)

Replace the `motors[0]` + scalar-`D` assumption with a loop over `D`'s keys:

```ts
const validMac = await getStarterByMacWithMotor(macAddress); // already returns motors: []
const motorsByIndex = new Map(validMac.motors.map(m => [m.motor_index, m]));

for (const [key, newState] of Object.entries(message.D)) {
  const idx = parseMotorKey(key); // "m1" -> 1, "m12" -> 12; skip/log if no match
  const motor = idx !== null ? motorsByIndex.get(idx) : undefined;
  if (!motor) { logger.warn(`Ack for unknown motor slot ${key} on ${macAddress}`); continue; }
  // ...existing per-motor body from lines 1170-1204, unchanged, just inside this loop
}
```

- `parseMotorKey` = `/^m(\d+)$/i` — small new helper, not a schema change.
- Keep the existing transaction wrapping the whole loop (one DB transaction per ack, not one per motor) so a partial write never leaves state inconsistent.
- **Always apply the DB update per key present in `D`, regardless of whether an outstanding `pendingAckMap` entry exists.** The device can also send `T:31` spontaneously (e.g. physical button press at the box) — that must keep working exactly as it silently does today; only the *resolution of the waiting HTTP request* (3.2) is conditional on the `S` match.
- If `pendingAckMap` has an entry for this MAC and `message.S` matches, resolve it. If `D` contains fewer keys than were requested, resolve as `PARTIAL_ACK` instead of `true`/`false` — this needs `waitForAck`'s resolver to carry which keys were requested (small extension of the existing `pendingAckMap` value shape, not a new subsystem).
- Notifications: the existing per-motor notification call (`prepareMotorStateControlNotificationData` + `shouldSendNotification`) already dedupes by `motorId`, so looping naturally sends one notification per motor that actually changed state — no batching needed.

### 3.5 Data model change (one migration)

`motors.motor_index` exists but is **not unique** per starter today. Add a partial unique index so `starter_id + motor_index` unambiguously identifies exactly one motor (guards against two motors accidentally sharing `m1` on the same box):

```sql
CREATE UNIQUE INDEX unique_starter_motor_index
  ON motors (starter_id, motor_index)
  WHERE status != 'ARCHIVED';
```

No other schema changes are required — `motors`, `starter_boxes.motor_support_type`, and the `motors` relation (`many` per starter) already model this correctly; they've just never been exercised by control/ack code.

### 3.6 Validation

- Reject requests where any `motor_id` doesn't belong to `starterId`, is `ARCHIVED`, or where `starterId`'s `motor_support_type = SINGLE_MOTOR` but more than one motor is requested (defensive; shouldn't happen from a correct frontend, but the API shouldn't trust the client).
- Reject empty `motors: []`.

## 4. Frontend changes

### 4.1 Selection UI

The existing per-row M1/M2 toggles (see the "Multi-Motor Demo" screen) become the entry point for **both** cases:

- **Single-motor action**: user flips one motor's toggle → fire the control call with a 1-element array immediately (no extra "select then apply" step needed for the common case).
- **Multi-motor action**: add a lightweight selection mode — a checkbox next to each M1/M2 row (or long-press / "select" affordance) that lets the user check M1 + M2 (+ M3...) together, plus a single "Turn ON" / "Turn OFF" (or per-motor state list, if independent states are needed) bulk-apply control that appears once ≥1 motor is checked. Internally this still calls the **same** API function as the single-toggle path, just with more array entries — one client-side function, one endpoint, matching the backend design in §3.3.

### 4.2 API layer

```ts
async function sendMotorControl(starterId: number, motors: { motor_id: number; state: 0 | 1 }[]) {
  return apiClient.post(`/motors/starter/${starterId}/control`, { motors });
}
```

Used identically by the single-toggle handler (`motors: [{ motor_id, state }]`) and the bulk-action handler (`motors: selected.map(...)`).

### 4.3 UX / state handling (mirrors the schedule "Resync" pattern already in the app)

1. **Optimistic-but-honest**: on tap, disable the affected toggle(s) and show a small inline spinner — do **not** flip the switch visually until a response comes back, since the whole point of §2 is that the response is authoritative and arrives within ~1s typically (worst case ~30s).
2. On `status: "ACKED"` → flip the toggle(s) to the new state, clear the spinner.
3. On `status: "PARTIAL_ACK"` → flip only the motors present in `results[].acked === true`; show an inline warning ("M2 not confirmed") on the rest with a retry action.
4. On `status: "TIMEOUT"` / network error → revert to previous state, show the same "Not yet synced to device · tap Resync to send" affordance already used for schedules, with a retry button that just re-calls the same endpoint.
5. Because §2 deliberately avoids a persisted pending state, there is nothing to reconcile on next screen load — a stale/never-acked command simply isn't reflected in `motors.state`, so a fresh `GET` always reflects DB truth. No polling loop is needed.

### 4.4 Multi-box awareness

If the box's `motor_support_type` is `SINGLE_MOTOR`, hide the selection/bulk-apply UI entirely and keep today's single-toggle behavior — no visual change for existing single-motor customers.

## 5. Rollout / testing checklist

- [ ] Migration: add `unique_starter_motor_index` partial unique index.
- [ ] `buildMotorControlPayload` + unit tests for `D` shape (1 motor, N motors, mixed states).
- [ ] `sendMotorControlCommand` retry/timeout behavior (reuse existing `waitForAck` tests as a template if present).
- [ ] `POST /motors/starter/:starterId/control` — single motor, multi-motor, invalid `motor_id`, `SINGLE_MOTOR` box with 2 motors requested (should 400).
- [ ] `motorControlAckHandler` — ack with 1 key, ack with N keys, ack with an unknown key (`m9` when box only has m1/m2 — should log & skip, not throw), spontaneous ack with no matching `pendingAckMap` entry (must still update DB).
- [ ] Manually verify against a real/simulated device: publish `{T:1,S:89,D:{m1:1,m2:1}}`, confirm both motors flip in DB and UI after the device's `{T:31,...}` ack.
- [ ] Frontend: single toggle, multi-select bulk action, timeout/revert path, `SINGLE_MOTOR` box shows no bulk UI.

## 6. Open questions for the team

1. Should `PATCH /motors/:id`'s `state` field be removed/deprecated now, or left in place for some other caller we haven't traced? (Confirm no other flow relies on DB-only state writes without a device command.)
2. For `PARTIAL_ACK`, should the backend auto-retry only the un-acked motor keys, or leave that entirely to the user via a manual retry? (Plan above assumes manual retry, matching the schedule "Resync" UX.)
3. Any upper bound on motors per box (M1..M?) we should validate against, or is it open-ended per `motor_index`?
