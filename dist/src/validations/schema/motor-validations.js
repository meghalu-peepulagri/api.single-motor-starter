import * as v from "valibot";
import { DEVICE_ID_REQUIRED, LOCATION_REQUIRED } from "../../constants/app-constants.js";
import { hpValidator, motorNameValidator, requiredNumber } from "./common-validations.js";
export const vAddMotor = v.object({
    name: motorNameValidator,
    hp: hpValidator,
    location_id: v.nullish(v.optional(v.number())),
    starter_id: v.optional(v.number()),
    motor_reference: v.optional(v.picklist(["m1", "m2"], "Motor reference must be m1 or m2")),
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
export const vAssignMotorToDevice = v.object({
    starter_id: requiredNumber(DEVICE_ID_REQUIRED),
    motor_reference: v.optional(v.picklist(["m1", "m2"], "Motor reference must be m1 or m2")),
});
export const vReplaceMotorDevice = v.object({
    name: motorNameValidator,
    hp: hpValidator,
    location_id: v.nullish(v.optional(v.number())),
});
