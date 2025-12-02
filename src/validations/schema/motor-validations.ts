import * as v from "valibot";
import { FIELD_REQUIRED } from "../../constants/app-constants.js";
import { hpValidator, motorNameValidator, requiredNumber } from "./common-validations.js";

export const vAddMotor = v.object({
  name: motorNameValidator,
  hp: hpValidator,
  field_id: requiredNumber(FIELD_REQUIRED),
});


export type validatedAddMotor = v.InferOutput<typeof vAddMotor>;
