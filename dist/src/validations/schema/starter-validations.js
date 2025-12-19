import * as v from "valibot";
import { DEPLOYED_STATUS, DEVICE_ID_REQUIRED, LOCATION_REQUIRED, MOTOR_ID_REQUIRED, USER_ID_REQUIRED } from "../../constants/app-constants.js";
import { hpValidator, macAddressValidator, motorNameValidator, pcbNumberValidator, requiredNumber, starterBoxTitleValidator, starterNumberValidator } from "./common-validations.js";
const deviceStatusValidator = v.picklist(DEPLOYED_STATUS, "Invalid device status");
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
    motor_id: requiredNumber(MOTOR_ID_REQUIRED),
});
export const vReplaceStarter = v.object({
    starter_id: requiredNumber(DEVICE_ID_REQUIRED),
    motor_id: requiredNumber(MOTOR_ID_REQUIRED),
    location_id: requiredNumber(LOCATION_REQUIRED),
});
export const vAssignStarterWeb = v.object({
    starter_id: requiredNumber(DEVICE_ID_REQUIRED),
    user_id: requiredNumber(USER_ID_REQUIRED)
});
export const vUpdateDeployedStatus = v.object({
    deploy_status: deviceStatusValidator,
});
