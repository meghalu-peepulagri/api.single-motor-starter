import * as v from "valibot";

const PERMISSION_KEYS = [
  "MOTOR_CONTROL", "MODE_CONTROL", "SCHEDULES", "SETTINGS_HANDLE",
] as const;

export const createSubUserSchema = v.object({
  full_name: v.pipe(v.string(), v.minLength(2)),
  phone: v.pipe(v.string(), v.length(10)),
  email: v.optional(v.pipe(v.string(), v.email())),
  password: v.optional(v.string()),
});

export const updatePermissionsSchema = v.object({
  permissions: v.array(v.picklist(PERMISSION_KEYS)),
});

export const assignPermissionsSchema = v.object({
  permissions: v.pipe(v.array(v.picklist(PERMISSION_KEYS)), v.minLength(1)),
});

export const removePermissionsSchema = v.object({
  permissions: v.pipe(v.array(v.picklist(PERMISSION_KEYS)), v.minLength(1)),
});

export type CreateSubUserInput      = v.InferOutput<typeof createSubUserSchema>;
export type UpdatePermissionsInput  = v.InferOutput<typeof updatePermissionsSchema>;
export type AssignPermissionsInput  = v.InferOutput<typeof assignPermissionsSchema>;
export type RemovePermissionsInput  = v.InferOutput<typeof removePermissionsSchema>;
