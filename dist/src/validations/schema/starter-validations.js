import * as v from "valibot";
import { DEPLOYED_STATUS, DEVICE_ID_REQUIRED, LOCATION_REQUIRED, MOTOR_ID_REQUIRED, MOTORS_ARRAY_REQUIRED, USER_ID_REQUIRED } from "../../constants/app-constants.js";
import { hardwareVersion, hpValidator, macAddressValidator, motorNameValidator, pcbNumberValidator, pcbOrSerialNumberValidator, requiredNumber, simNumberValidator, starterBoxTitleValidator, starterNumberValidator } from "./common-validations.js";
const deviceStatusValidator = v.picklist(DEPLOYED_STATUS, "Invalid device status");
export const vAddStarter = v.object({
    name: starterBoxTitleValidator,
    pcb_number: pcbNumberValidator,
    starter_number: starterNumberValidator,
    mac_address: macAddressValidator,
    //  Optional fields
    gateway_id: v.optional(v.union([v.number(), v.null()])),
    hardware_version: hardwareVersion,
    device_mobile_number: v.nullish(v.optional(simNumberValidator)),
    // "Motor Type" + "Starter Type" toggles and the per-motor list (M1, M2...) from the
    // Add Device & Motors screen. All optional so existing single-motor callers that omit
    // them keep working (they fall back to one default motor).
    motor_support_type: v.optional(v.picklist(["SINGLE_MOTOR", "MULTIPLE_MOTORS"], "Invalid motor type")),
    motor_starter_type: v.optional(v.picklist(["STAR_RELAY", "CONTACTOR"], "Invalid starter type")),
    motors: v.optional(v.pipe(v.array(v.object({
        name: motorNameValidator,
        hp: hpValidator,
    })), v.minLength(1, MOTORS_ARRAY_REQUIRED), v.maxLength(2, "A device supports at most 2 motors"))),
});
export const vAssignStarter = v.object({
    pcb_number: pcbOrSerialNumberValidator,
    location_id: requiredNumber(LOCATION_REQUIRED),
    device_installed_location: v.nullish(v.optional(v.string())),
    // Unified single & dual motor input: one entry per motor (single = array of 1, dual = array of 2).
    motors: v.pipe(v.array(v.object({
        motor_id: requiredNumber(MOTOR_ID_REQUIRED),
        motor_name: motorNameValidator,
        hp: v.optional(hpValidator),
        motor_reference: v.nullish(v.optional(v.string())),
    })), v.minLength(1, MOTORS_ARRAY_REQUIRED), v.maxLength(2, "A device supports at most 2 motors")),
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
export const vAssignLocationToStarter = v.object({
    location_id: requiredNumber(LOCATION_REQUIRED),
    starter_id: requiredNumber(DEVICE_ID_REQUIRED),
});
export const vUpdateInstalledLocation = v.object({
    device_installed_location: v.pipe(v.string("Device installed location is required"), v.trim(), v.nonEmpty("Installed location is required"), v.minLength(3, "Installed location has min 3 characters")),
});
