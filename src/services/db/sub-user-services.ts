import argon2 from "argon2";
import db from "../../database/configuration.js";
import { users } from "../../database/schemas/users.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import {
  getMultipleRecordsByMultipleColumnValues,
  getSingleRecordByMultipleColumnValues,
  saveSingleRecord,
  updateRecordByMultipleColumnValues,
} from "./base-db-services.js";
import type { CreateSubUserInput } from "../../validations/schema/sub-user-validations.js";

const SUB_USER_COLUMNS = ["id", "full_name", "phone", "email", "status"] as const;

export async function createSubUser(parentId: number, data: CreateSubUserInput) {
  return await db.transaction(async (trx) => {
    const hashedPassword = await argon2.hash(data.password ?? "i@123456");

    const newUser = await saveSingleRecord(users, {
      ...data,
      password:      hashedPassword,
      user_type:     "SUB_USER",
      parent_id:     parentId,
      created_by:    parentId,
      user_verified: true,
    }, trx);

    await saveSingleRecord(subUserPermissions, {
      sub_user_id: newUser.id,
      parent_id:   parentId,
      permissions: [],
    }, trx);

    return newUser;
  });
}

export async function getSubUsers(parentId: number) {
  return await getMultipleRecordsByMultipleColumnValues(
    users,
    ["parent_id", "user_type", "status"],
    ["=", "=", "!="],
    [parentId, "SUB_USER", "ARCHIVED"],
    SUB_USER_COLUMNS,
  );
}

export async function softDeleteSubUser(parentId: number, subUserId: number) {
  const updated = await updateRecordByMultipleColumnValues(
    users,
    ["id", "parent_id"],
    ["=", "="],
    [subUserId, parentId],
    { status: "ARCHIVED" },
  );
  return !!updated;
}

export async function getSubUserPermissions(subUserId: number, parentId: number): Promise<string[]> {
  const row = await getSingleRecordByMultipleColumnValues(
    subUserPermissions,
    ["sub_user_id", "parent_id"],
    ["=", "="],
    [subUserId, parentId],
  );
  return (row as any)?.permissions ?? [];
}

export async function setSubUserPermissions(subUserId: number, parentId: number, permissions: string[]) {
  return await updateRecordByMultipleColumnValues(
    subUserPermissions,
    ["sub_user_id", "parent_id"],
    ["=", "="],
    [subUserId, parentId],
    { permissions } as any,
  );
}

export async function removeSubUserPermissions(subUserId: number, parentId: number, keys: string[]): Promise<{ old: string[]; new: string[] } | null> {
  const current = await getSubUserPermissions(subUserId, parentId);
  if (current === null) return null;
  const updated = current.filter(p => !keys.includes(p));
  await updateRecordByMultipleColumnValues(
    subUserPermissions,
    ["sub_user_id", "parent_id"],
    ["=", "="],
    [subUserId, parentId],
    { permissions: updated } as any,
  );
  return { old: current, new: updated };
}
