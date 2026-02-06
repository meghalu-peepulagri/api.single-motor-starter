import * as v from "valibot";
import { LOCATION_REQUIRED } from "../../constants/app-constants.js";
import { hpValidator, motorNameValidator, requiredNumber } from "./common-validations.js";
export const vAddMotor = v.object({
    name: motorNameValidator,
    hp: hpValidator,
    location_id: requiredNumber(LOCATION_REQUIRED),
});
export const vUpdateMotor = v.object({
    name: motorNameValidator,
    hp: hpValidator,
    state: v.optional(v.number()),
    mode: v.optional(v.picklist(["MANUAL", "AUTO"])),
});
export const vUpdateMotorTestRunStatus = v.object({
    test_run_status: v.picklist(["IN_TEST", "COMPLETED", "FAILED"], "Test run status must be one of: IN_TEST, COMPLETED, or FAILED"),
});
