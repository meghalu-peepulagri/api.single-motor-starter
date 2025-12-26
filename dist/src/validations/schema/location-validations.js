import * as v from "valibot";
import { locationTitleValidator } from "./common-validations.js";
import { INVALID_USER_ID } from "../../constants/app-constants.js";
export const vAddLocation = v.object({
    name: locationTitleValidator,
    user_id: v.optional(v.number(INVALID_USER_ID)),
});
