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
 * Builds the T:1 MOTOR_CONTROL publish payload. Only the requested motors are
 * included in D — e.g. one target -> { "m1": 1 }, several -> { "m1": 1, "m2": 0 }.
 */
export function buildMotorControlPayload(targets: MotorControlTarget[]): MotorControlPayload {
  const D: Record<string, 0 | 1> = {};
  for (const target of targets) D[motorKey(target.motor_index)] = target.state;
  return { T: REQUEST_TYPES.MOTOR_CONTROL, S: randomSequenceNumber(), D };
}
