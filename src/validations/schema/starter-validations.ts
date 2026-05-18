import * as v from "valibot";
import { DEPLOYED_STATUS, DEVICE_ID_REQUIRED, DEVICE_ROLES, INVALID_REASSIGNMENT, INVALID_REPLACE_MODE, INVALID_ROLE, LOCATION_REQUIRED, MOTOR_ID_REQUIRED, REASSIGNMENT_STRATEGIES, REPLACE_MASTER_MODES, USER_ID_REQUIRED } from "../../constants/app-constants.js";
import { hardwareVersion, hpValidator, macAddressValidator, motorNameValidator, pcbNumberValidator, pcbOrSerialNumberValidator, requiredNumber, simNumberValidator, starterBoxTitleValidator, starterNumberValidator } from "./common-validations.js";
const deviceStatusValidator = v.picklist(DEPLOYED_STATUS, "Invalid device status");
const roleValidator = v.picklist(DEVICE_ROLES, INVALID_ROLE);
const reassignmentValidator = v.picklist(REASSIGNMENT_STRATEGIES, INVALID_REASSIGNMENT);

export const vAddStarter = v.object({
  name: starterBoxTitleValidator,
  pcb_number: pcbNumberValidator,
  starter_number: starterNumberValidator,
  mac_address: macAddressValidator,

  //  Optional fields
  gateway_id: v.optional(v.union([v.number(), v.null()])),
  hardware_version: hardwareVersion,
  device_mobile_number: v.nullish(v.optional(simNumberValidator)),
  starter_type : v.optional(v.picklist(["SINGLE_STARTER", "MULTI_STARTER"], "Invalid starter type")),

  // Topology fields (optional — default STANDALONE on insert)
  role: v.optional(roleValidator),
  parent_starter_id: v.nullish(v.optional(v.number())),
});

export const vAssignStarter = v.object({
  pcb_number: pcbOrSerialNumberValidator,
  motor_name: motorNameValidator,
  location_id: requiredNumber(LOCATION_REQUIRED),
  hp: hpValidator,
  device_installed_location: v.nullish(v.optional(v.string())),
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

export const vUpdateInstalledLocation = v.object({
  device_installed_location: v.pipe(
    v.string("Device installed location is required"),
    v.trim(),
    v.nonEmpty("Installed location is required"),
    v.minLength(3, "Installed location has min 3 characters"),
  ),
});

export const vChangeRole = v.object({
  role: roleValidator,
  parent_starter_id: v.nullish(v.optional(v.number())),
  // Used only when demoting a MASTER that has children
  reassignment: v.optional(reassignmentValidator),
  new_parent_id: v.nullish(v.optional(v.number())),
});

export const vReparent = v.object({
  parent_starter_id: requiredNumber("Parent device is required"),
});

export const vReplaceMaster = v.object({
  old_master_id: requiredNumber("Old master device is required"),
  new_master_id: requiredNumber("New master device is required"),
  // Modes:
  //   SWAP_CHILDREN  → both MASTER. A's children become B's, and vice versa. Both stay alive.
  //   MOVE_CHILDREN  → both MASTER. Move children from old → new.
  //                    child_ids omitted/empty = move ALL.
  //                    child_ids = [..] = move only those (must belong to old_master).
  //   REPLACE_DEVICE → old MASTER + new STANDALONE. Children move to new, old archived,
  //                    new takes over location/user/device_status.
  // If mode is omitted, it is auto-detected from the device roles.
  mode: v.optional(v.picklist(REPLACE_MASTER_MODES, INVALID_REPLACE_MODE)),
  child_ids: v.optional(v.array(v.number())),
});

export type validatedAddStarter = v.InferOutput<typeof vAddStarter>;
export type validatedAssignStarter = v.InferOutput<typeof vAssignStarter>;
export type validatedReplaceStarter = v.InferOutput<typeof vReplaceStarter>;
export type validatedAssignStarterWeb = v.InferOutput<typeof vAssignStarterWeb>;
export type validatedUpdateDeployedStatus = v.InferOutput<typeof vUpdateDeployedStatus>;
export type validatedAssignLocationToStarter = v.InferOutput<typeof vAssignLocationToStarter>;
export type validatedUpdateInstalledLocation = v.InferOutput<typeof vUpdateInstalledLocation>;
export type validatedChangeRole = v.InferOutput<typeof vChangeRole>;
export type validatedReparent = v.InferOutput<typeof vReparent>;
export type validatedReplaceMaster = v.InferOutput<typeof vReplaceMaster>;