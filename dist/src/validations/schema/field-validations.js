import * as v from "valibot";
import { ACRES_REQUIRED, LOCATION_REQUIRED } from "../../constants/app-constants.js";
import { filedNameValidator, hpValidator, motorNameValidator, requiredNumber, requiredNumberOptional } from "./common-validations.js";
export const vAddField = v.object({
    field_name: filedNameValidator,
    location_id: requiredNumber(LOCATION_REQUIRED),
    acres: requiredNumberOptional(ACRES_REQUIRED),
    motors: v.optional(v.array(v.object({
        name: motorNameValidator,
        hp: hpValidator,
    }))),
});
