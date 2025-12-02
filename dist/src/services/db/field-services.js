import db from "../../database/configuration.js";
import { fields } from "../../database/schemas/fields.js";
import { motors } from "../../database/schemas/motors.js";
import { saveRecords, saveSingleRecord } from "./base-db-services.js";
export async function addFieldWithMotorTransaction(validData, userPayload) {
    const { motors: motorsData, ...fieldData } = validData;
    const fieldPayload = { ...fieldData, created_by: userPayload.id, acres: fieldData.acres ? String(fieldData.acres) : null };
    return await db.transaction(async (trx) => {
        const createdField = await saveSingleRecord(fields, fieldPayload, trx);
        const baseTime = new Date();
        const preparedMotorsData = motorsData?.map((motor, index) => ({
            ...motor,
            created_by: userPayload.id,
            created_at: new Date(baseTime.getTime() + index * 1000),
            filed_id: createdField.id,
        }));
        if (preparedMotorsData?.length) {
            await saveRecords(motors, preparedMotorsData, trx);
        }
        return createdField;
    });
}
