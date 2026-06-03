import argon2 from "argon2";
import { eq } from "drizzle-orm";
import db from "../../database/configuration.js";
import { users } from "../../database/schemas/users.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import { getMultipleRecordsByMultipleColumnValues, getSingleRecordByMultipleColumnValues, getSingleRecordByAColumnValue, saveSingleRecord, updateRecordByMultipleColumnValues, } from "./base-db-services.js";
const SUB_USER_COLUMNS = ["id", "full_name", "phone", "email", "status"];
export async function isPhoneTaken(phone) {
    const row = await getSingleRecordByMultipleColumnValues(users, ["phone", "status"], ["=", "!="], [phone, "ARCHIVED"]);
    return !!row;
}
export async function createSubUser(parentId, createdBy, data) {
    return await db.transaction(async (trx) => {
        const hashedPassword = await argon2.hash(data.password ?? "i@123456");
        const newUser = await saveSingleRecord(users, {
            ...data,
            password: hashedPassword,
            user_type: "SUB_USER",
            parent_id: parentId,
            created_by: createdBy,
            user_verified: true,
        }, trx);
        await saveSingleRecord(subUserPermissions, {
            sub_user_id: newUser.id,
            parent_id: parentId,
            permissions: [],
        }, trx);
        return newUser;
    });
}
export async function getSubUsers(parentId) {
    return await getMultipleRecordsByMultipleColumnValues(users, ["parent_id", "user_type", "status"], ["=", "=", "!="], [parentId, "SUB_USER", "ARCHIVED"], SUB_USER_COLUMNS);
}
export async function softDeleteSubUser(subUserId) {
    return await db.transaction(async (trx) => {
        const updated = await updateRecordByMultipleColumnValues(users, ["id"], ["="], [subUserId], { status: "ARCHIVED" }, undefined, trx);
        if (!updated)
            return false;
        await trx.delete(subUserPermissions)
            .where(eq(subUserPermissions.sub_user_id, subUserId));
        return true;
    });
}
export async function getSubUserPermissions(subUserId) {
    const row = await getSingleRecordByMultipleColumnValues(subUserPermissions, ["sub_user_id"], ["="], [subUserId]);
    return row?.permissions ?? [];
}
export async function setSubUserPermissions(subUserId, permissions) {
    return await updateRecordByMultipleColumnValues(subUserPermissions, ["sub_user_id"], ["="], [subUserId], { permissions });
}
export async function removeSubUserPermissions(subUserId, keys) {
    const current = await getSubUserPermissions(subUserId);
    if (current === null)
        return null;
    const updated = current.filter(p => !keys.includes(p));
    await updateRecordByMultipleColumnValues(subUserPermissions, ["sub_user_id"], ["="], [subUserId], { permissions: updated });
    return { old: current, new: updated };
}
