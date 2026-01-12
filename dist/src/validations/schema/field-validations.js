import * as v from "valibot";
import { ACRES_REQUIRED, LOCATION_REQUIRED, MOTOR_ID_REQUIRED } from "../../constants/app-constants.js";
import { fieldNameValidator, hpValidator, motorNameValidator, requiredNumber, requiredNumberOptional } from "./common-validations.js";
export const vAddField = v.object({
    field_name: fieldNameValidator,
    location_id: requiredNumber(LOCATION_REQUIRED),
    acres: requiredNumberOptional(ACRES_REQUIRED),
    motors: v.optional(v.array(v.object({
        id: requiredNumberOptional(MOTOR_ID_REQUIRED),
        name: motorNameValidator,
        hp: hpValidator,
    }))),
});
