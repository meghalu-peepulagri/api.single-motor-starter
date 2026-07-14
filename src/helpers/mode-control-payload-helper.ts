import { motorKey } from "./motor-control-payload-helper.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { REQUEST_TYPES, modeToControlCode } from "./packet-types-helper.js";

export type MotorMode = "MANUAL" | "AUTO" | "SCHEDULE";
export type ModeControlTarget = { motor_index: number; mode: MotorMode };

export type ModeControlPayload = {
  T: typeof REQUEST_TYPES.MODE_CHANGE;
  S: number;
  D: Record<string, 0 | 1 | 2>;
};

/**
 * Builds the T:2 MODE_CHANGE publish payload. Only the requested motors are
 * included in D — e.g. one target -> { "m1": 1 }, several -> { "m1": 1, "m2": 0 }.
 */
export function buildModeControlPayload(targets: ModeControlTarget[]): ModeControlPayload {
  const D: Record<string, 0 | 1 | 2> = {};
  for (const target of targets) D[motorKey(target.motor_index)] = modeToControlCode(target.mode);
  return { T: REQUEST_TYPES.MODE_CHANGE, S: randomSequenceNumber(), D };
}
