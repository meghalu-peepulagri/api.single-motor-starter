import argon2 from "argon2";
import { eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { users } from "../../database/schemas/users.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import {
  getMultipleRecordsByMultipleColumnValues,
  getSingleRecordByMultipleColumnValues,
  getSingleRecordByAColumnValue,
  saveSingleRecord,
  updateRecordByMultipleColumnValues,
} from "./base-db-services.js";
import type { CreateSubUserInput, UpdateSubUserInput } from "../../validations/schema/sub-user-validations.js";

const SUB_USER_COLUMNS = ["id", "full_name", "phone", "email", "status"] as const;

export async function isPhoneTaken(phone: string, excludeId?: number): Promise<boolean> {
  const columns: any[] = ["phone", "status"];
  const relations: any[] = ["=", "!="];
  const values: any[] = [phone, "ARCHIVED"];
  if (excludeId) { columns.push("id"); relations.push("!="); values.push(excludeId); }
  const row = await getSingleRecordByMultipleColumnValues(users, columns, relations, values);
  return !!row;
}

export async function createSubUser(parentId: number, createdBy: number, data: CreateSubUserInput) {
  return await db.transaction(async (trx) => {
    const hashedPassword = await argon2.hash(data.password ?? "i@123456");

    const newUser = await saveSingleRecord(users, {
      ...data,
      password:      hashedPassword,
      user_type:     "SUB_USER",
      parent_id:     parentId,
      created_by:    createdBy,
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

export async function updateSubUser(subUserId: number, data: UpdateSubUserInput) {
  return await updateRecordByMultipleColumnValues(
    users,
    ["id", "user_type"],
    ["=", "="],
    [subUserId, "SUB_USER"],
    data,
  );
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

export async function softDeleteSubUser(subUserId: number) {
  return await db.transaction(async (trx) => {
    const updated = await updateRecordByMultipleColumnValues(
      users,
      ["id"],
      ["="],
      [subUserId],
      { status: "ARCHIVED" },
      undefined,
      trx,
    );
    if (!updated) return false;

    await trx.delete(subUserPermissions)
      .where(eq(subUserPermissions.sub_user_id, subUserId));

    return true;
  });
}

export async function getSubUserPermissions(subUserId: number): Promise<string[]> {
  const row = await getSingleRecordByMultipleColumnValues(
    subUserPermissions,
    ["sub_user_id"],
    ["="],
    [subUserId],
  );
  return (row as any)?.permissions ?? [];
}

export async function setSubUserPermissions(subUserId: number, permissions: string[]) {
  return await updateRecordByMultipleColumnValues(
    subUserPermissions,
    ["sub_user_id"],
    ["="],
    [subUserId],
    { permissions } as any,
  );
}

export async function removeSubUserPermissions(subUserId: number, keys: string[]): Promise<{ old: string[]; new: string[] } | null> {
  const current = await getSubUserPermissions(subUserId);
  if (current === null) return null;
  const updated = current.filter(p => !keys.includes(p));
  await updateRecordByMultipleColumnValues(
    subUserPermissions,
    ["sub_user_id"],
    ["="],
    [subUserId],
    { permissions: updated } as any,
  );
  return { old: current, new: updated };
}
