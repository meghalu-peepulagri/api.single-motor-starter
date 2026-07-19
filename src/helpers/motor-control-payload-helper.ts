import { randomSequenceNumber } from "./mqtt-helpers.js";
import { REQUEST_TYPES } from "./packet-types-helper.js";

export type MotorControlTarget = { motor_index: number; state: 0 | 1 };

export type MotorControlPayload = {
  T: typeof REQUEST_TYPES.MOTOR_CONTROL;
  S: number;
  D: Record<string, 0 | 1>;
};

const MOTOR_KEY_PATTERN = /^m(\d+)$/i;

export function motorKey(motorIndex: number): string {
  return `m${motorIndex}`;
}

/** "m1" -> 1, "m12" -> 12, anything else -> null. */
export function parseMotorKey(key: string): number | null {
  const match = MOTOR_KEY_PATTERN.exec(key);
  return match ? Number(match[1]) : null;
}

/**
 * Normalizes a device ack's `D` field into the per-motor map form the ack handlers
 * expect. Multi-motor devices send a map — e.g. { "m1": 1, "m2": 6 }. Single-motor
 * devices send a bare scalar instead — e.g. `0`/`1` (state, T:31) or `0`/`1`/`2`
 * (mode, T:32) — which corresponds to the box's single motor at slot 1 ("m1").
 * Without this, `Object.entries(0)` yields nothing, so the single-motor ack loop
 * never runs and the mode/state is never persisted (reverts to old value on refresh).
 */
export function normalizeDeviceAckD(D: unknown): Record<string, number> {
  if (D !== null && typeof D === "object" && !Array.isArray(D)) {
    return D as Record<string, number>;
  }
  if (typeof D === "number") {
    return { m1: D };
  }
  return {};
}

/**
 * Builds the T:1 MOTOR_CONTROL publish payload. Only the requested motors are
 * included in D — e.g. one target -> { "m1": 1 }, several -> { "m1": 1, "m2": 0 }.
 */
export function buildMotorControlPayload(targets: MotorControlTarget[]): MotorControlPayload {
  const D: Record<string, 0 | 1> = {};
  for (const target of targets) D[motorKey(target.motor_index)] = target.state;
  return { T: REQUEST_TYPES.MOTOR_CONTROL, S: randomSequenceNumber(), D };
}
