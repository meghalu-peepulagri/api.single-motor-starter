import { and, desc, isNotNull, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { fields } from "../../database/schemas/fields.js";
import { locations } from "../../database/schemas/locations.js";
import { motors } from "../../database/schemas/motors.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";
import { prepareOrderByQueryConditions, prepareWhereQueryConditionsWithOr } from "../../utils/db-utils.js";
import { getRecordsCount, saveRecords, saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";
import { bulkMotorsUpdate } from "./motor-service.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";
export async function addFieldWithMotorTransaction(validData, userPayload) {
    const { motors: motorsData, ...fieldData } = validData;
    const fieldPayload = { ...fieldData, name: fieldData.field_name, created_by: userPayload.id, acres: fieldData.acres ? String(fieldData.acres) : null };
    return await db.transaction(async (trx) => {
        const createdField = await saveSingleRecord(fields, fieldPayload, trx);
        const baseTime = new Date();
        // TODO: Remove any with type
        const preparedMotorsData = motorsData?.map((motor, index) => ({
            ...motor,
            created_by: userPayload.id,
            created_at: new Date(baseTime.getTime() + index * 1000),
            field_id: createdField.id,
        }));
        if (preparedMotorsData?.length) {
            await saveRecords(motors, preparedMotorsData, trx);
        }
        return createdField;
    });
}
export async function paginatedFieldsList(whereQueryData, orderByQueryData, pageParams) {
    const whereConditions = prepareWhereQueryConditionsWithOr(fields, whereQueryData);
    const whereQuery = whereConditions && whereConditions.length > 0 ? and(...whereConditions) : undefined;
    const orderQuery = prepareOrderByQueryConditions(fields, orderByQueryData);
    const fieldsList = await db.query.fields.findMany({
        where: whereQuery,
        orderBy: orderQuery,
        limit: pageParams.pageSize,
        offset: pageParams.offset,
        columns: {
            id: true, name: true, acres: true, status: true,
            created_at: true, updated_at: true,
        },
        with: {
            location: {
                where: ne(locations.status, "ARCHIVED"),
                columns: { id: true, name: true },
            },
            motors: {
                where: ne(motors.status, "ARCHIVED"),
                orderBy: [desc(motors.created_at)],
                columns: {
                    id: true, name: true, hp: true, mode: true, state: true,
                },
                with: {
                    starter: {
                        where: ne(starterBoxes.status, "ARCHIVED"),
                        columns: {
                            id: true, name: true, status: true, mac_address: true,
                            signal_quality: true, power: true, network_type: true,
                        },
                        with: {
                            starterParameters: {
                                where: isNotNull(starterBoxParameters.time_stamp),
                                orderBy: [desc(starterBoxParameters.time_stamp)],
                                limit: 1,
                                columns: {
                                    id: true,
                                    time_stamp: true,
                                    fault: true,
                                    fault_description: true,
                                    line_voltage_r: true,
                                    line_voltage_y: true,
                                    line_voltage_b: true,
                                    current_r: true,
                                    current_y: true,
                                    current_b: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    const totalRecords = await getRecordsCount(fields, whereConditions || []);
    const pagination = getPaginationData(pageParams.page, pageParams.pageSize, totalRecords);
    return {
        pagination_info: pagination,
        records: fieldsList,
    };
}
export async function updateFieldWithMotorTransaction(validData, fieldId, userPayload) {
    const { motors: motorsData = [], ...fieldData } = validData;
    const fieldPayload = { ...fieldData, name: fieldData.field_name, acres: fieldData.acres ? String(fieldData.acres) : null };
    await db.transaction(async (trx) => {
        const updatedField = await updateRecordByIdWithTrx(fields, fieldId, fieldPayload, trx);
        const updateMotors = motorsData.filter(m => m.id !== undefined).map(m => ({
            id: Number(m.id),
            name: m.name,
            hp: Number(m.hp),
        }));
        if (updateMotors.length > 0) {
            await bulkMotorsUpdate(updateMotors, trx);
        }
        const motorsToCreate = motorsData.filter(m => m.id === undefined).map((m, index) => ({
            name: m.name,
            hp: String(m.hp),
            field_id: Number(updatedField.id),
            created_by: userPayload.id,
            created_at: new Date(Date.now() + index * 1000)
        }));
        if (motorsToCreate.length > 0) {
            await saveRecords(motors, motorsToCreate, trx);
        }
    });
}
