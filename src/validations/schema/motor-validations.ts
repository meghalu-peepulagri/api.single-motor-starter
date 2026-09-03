import * as v from "valibot";
import { LOCATION_REQUIRED, MOTOR_CONTROL_MODE_INVALID, MOTOR_CONTROL_STATE_INVALID, MOTOR_ID_REQUIRED, MOTORS_ARRAY_REQUIRED } from "../../constants/app-constants.js";
import { hpValidator, motorNameValidator, requiredNumber } from "./common-validations.js";

export const vAddMotor = v.object({
  name: motorNameValidator,
  hp: hpValidator,
  location_id: requiredNumber(LOCATION_REQUIRED),
});

/**
 * Adding a second motor to an existing single-motor starter (POST /motors/starter/:starterId).
 * Separate from vAddMotor, which creates a standalone motor row and is left untouched.
 * location_id is optional here — it defaults to the existing motor's location, since both
 * motors of one box sit at the same site.
 */
export const vAddMotorToStarter = v.object({
  name: motorNameValidator,
  hp: hpValidator,
  location_id: v.nullish(v.optional(v.number())),
  motor_reference: v.nullish(v.optional(v.string())),
});

export const vUpdateMotor = v.object({
  name: motorNameValidator,
  hp: hpValidator,
  state: v.optional(v.number()),
  mode: v.optional(v.picklist(["MANUAL", "AUTO"])),
});

export const vUpdateMotorTestRunStatus = v.object({
  test_run_status: v.picklist(["IN_TEST", "COMPLETED", "FAILED", "PROCESSING"], "Test run status must be one of: IN_TEST, COMPLETED, or FAILED"),
});

// One entry per motor to command — a single-motor request is just an array of length 1,
// so this schema covers both the single and multi-motor control cases.
export const vControlMotors = v.object({
  motors: v.pipe(
    v.array(v.object({
      motor_id: requiredNumber(MOTOR_ID_REQUIRED),
      motor_reference: v.optional(v.string()),
      state: v.picklist([0, 1], MOTOR_CONTROL_STATE_INVALID),
    })),
    v.minLength(1, MOTORS_ARRAY_REQUIRED),
  ),
});

// Mode control mirrors vControlMotors — one entry per motor, single or multi.
// SCHEDULE is deliberately excluded: it's system-driven (set when a schedule runs),
// not a state a user picks manually, matching vUpdateMotor.mode above.
export const vControlMotorsMode = v.object({
  motors: v.pipe(
    v.array(v.object({
      motor_id: requiredNumber(MOTOR_ID_REQUIRED),
      motor_reference: v.optional(v.string()),
      mode: v.picklist(["MANUAL", "AUTO", "SCHEDULE"], MOTOR_CONTROL_MODE_INVALID),
    })),
    v.minLength(1, MOTORS_ARRAY_REQUIRED),
  ),
});

export type validatedAddMotor = v.InferOutput<typeof vAddMotor>;
export type validatedAddMotorToStarter = v.InferOutput<typeof vAddMotorToStarter>;
export type validatedUpdateMotor = v.InferOutput<typeof vUpdateMotor>;
export type validatedUpdateMotorTestRunStatus = v.InferOutput<typeof vUpdateMotorTestRunStatus>;
export type validatedControlMotors = v.InferOutput<typeof vControlMotors>;
export type validatedControlMotorsMode = v.InferOutput<typeof vControlMotorsMode>;
