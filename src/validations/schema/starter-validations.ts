import * as v from "valibot";
import { DEPLOYED_STATUS, DEVICE_ID_REQUIRED, LOCATION_REQUIRED, MOTOR_ID_REQUIRED, USER_ID_REQUIRED } from "../../constants/app-constants.js";
import { hardwareVersion, hpValidator, macAddressValidator, motorNameValidator, pcbNumberValidator, pcbOrSerialNumberValidator, requiredNumber, starterBoxTitleValidator, starterNumberValidator } from "./common-validations.js";
const deviceStatusValidator = v.picklist(DEPLOYED_STATUS, "Invalid device status");

export const vAddStarter = v.object({
  name: starterBoxTitleValidator,
  pcb_number: pcbNumberValidator,
  starter_number: starterNumberValidator,
  mac_address: macAddressValidator,

  //  Optional fields
  gateway_id: v.optional(v.union([v.number(), v.null()])),
  hardware_version: hardwareVersion,

});

export const vAssignStarter = v.object({
  pcb_number: pcbOrSerialNumberValidator,
  motor_name: motorNameValidator,
  location_id: requiredNumber(LOCATION_REQUIRED),
  hp: hpValidator,
});

export const vReplaceStarter = v.object({
  starter_id: requiredNumber(DEVICE_ID_REQUIRED),
  motor_id: requiredNumber(MOTOR_ID_REQUIRED),
  location_id: requiredNumber(LOCATION_REQUIRED),
})

export const vAssignStarterWeb = v.object({
  starter_id: requiredNumber(DEVICE_ID_REQUIRED),
  user_id: requiredNumber(USER_ID_REQUIRED)
})

export const vUpdateDeployedStatus = v.object({
  deploy_status: deviceStatusValidator,
})

export const vAssignLocationToStarter = v.object({
  location_id: requiredNumber(LOCATION_REQUIRED),
  starter_id: requiredNumber(DEVICE_ID_REQUIRED),
});

export type validatedAddStarter = v.InferOutput<typeof vAddStarter>;
export type validatedAssignStarter = v.InferOutput<typeof vAssignStarter>;
export type validatedReplaceStarter = v.InferOutput<typeof vReplaceStarter>;
export type validatedAssignStarterWeb = v.InferOutput<typeof vAssignStarterWeb>;
export type validatedUpdateDeployedStatus = v.InferOutput<typeof vUpdateDeployedStatus>;
export type validatedAssignLocationToStarter = v.InferOutput<typeof vAssignLocationToStarter>;