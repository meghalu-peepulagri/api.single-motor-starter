import * as v from "valibot";
import { emailValidator, nameValidator, passwordValidator, phoneValidator } from "./common-validations.js";
const PERMISSION_KEYS = [
    "MOTOR_CONTROL", "MODE_CONTROL", "SCHEDULES", "SETTINGS_HANDLE",
];
export const createSubUserSchema = v.object({
    full_name: nameValidator,
    email: emailValidator,
    phone: phoneValidator,
    password: passwordValidator,
    signature_id: v.optional(v.string()),
});
export const updatePermissionsSchema = v.object({
    permissions: v.array(v.picklist(PERMISSION_KEYS)),
});
export const removePermissionsSchema = v.object({
    permissions: v.pipe(v.array(v.picklist(PERMISSION_KEYS)), v.minLength(1)),
});
