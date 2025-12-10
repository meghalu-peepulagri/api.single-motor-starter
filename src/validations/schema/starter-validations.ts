import * as v from "valibot";
import { hpValidator, macAddressValidator, motorNameValidator, pcbNumberValidator, requiredNumber, serialNoValidator, starterBoxTitleValidator, starterNumberValidator } from "./common-validations.js";
import { LOCATION_REQUIRED } from "../../constants/app-constants.js";

export const vAddStarter = v.object({
  name: starterBoxTitleValidator,
  pcb_number: pcbNumberValidator,
  starter_number: starterNumberValidator,
  mac_address: macAddressValidator,

  //  Optional fields
  gateway_id: v.optional(v.union([v.number(), v.null()])),

});

export const vAssignStarter = v.object({
  pcb_number: pcbNumberValidator,
  motor_name: motorNameValidator,
  location_id: requiredNumber(LOCATION_REQUIRED),
  hp: hpValidator,
});

export type validatedAddStarter = v.InferOutput<typeof vAddStarter>;
export type validatedAssignStarter = v.InferOutput<typeof vAssignStarter>;