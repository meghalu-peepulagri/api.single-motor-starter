import argon2 from "argon2";
import { and, eq, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { users } from "../../database/schemas/users.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import { getMultipleRecordsByMultipleColumnValues, getSingleRecordByMultipleColumnValues, getSingleRecordByAColumnValue, saveSingleRecord, updateRecordByMultipleColumnValues, } from "./base-db-services.js";
const SUB_USER_COLUMNS = ["id", "full_name", "phone", "email", "status"];
export async function isPhoneTaken(phone, excludeId) {
    const columns = ["phone", "status"];
    const relations = ["=", "!="];
    const values = [phone, "ARCHIVED"];
    if (excludeId) {
        columns.push("id");
        relations.push("!=");
        values.push(excludeId);
    }
    const row = await getSingleRecordByMultipleColumnValues(users, columns, relations, values);
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
export async function updateSubUser(subUserId, data) {
    return await updateRecordByMultipleColumnValues(users, ["id", "user_type"], ["=", "="], [subUserId, "SUB_USER"], data);
}
export async function getSubUsers(parentId) {
    const rows = await db
        .select({
        id: users.id,
        full_name: users.full_name,
        phone: users.phone,
        email: users.email,
        status: users.status,
        permissions: subUserPermissions.permissions,
    })
        .from(users)
        .leftJoin(subUserPermissions, eq(subUserPermissions.sub_user_id, users.id))
        .where(and(eq(users.parent_id, parentId), eq(users.user_type, "SUB_USER"), ne(users.status, "ARCHIVED")));
    return rows.map(r => ({ ...r, permissions: r.permissions ?? [] }));
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
