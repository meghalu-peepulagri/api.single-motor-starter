import { ADDED_STARTER_SETTINGS, DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_NOT_FOUND, DEFAULT_SETTINGS_UPDATED, DEVICE_NOT_FOUND, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA, SETTINGS_FETCHED, SETTINGS_LIMITS_FETCHED, SETTINGS_LIMITS_NOT_FOUND, SETTINGS_LIMITS_UPDATED, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { starterDefaultSettings } from "../database/schemas/starter-default-settings.js";
import { starterSettingsLimits } from "../database/schemas/starter-settings-limits.js";
import { starterSettings } from "../database/schemas/starter-settings.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getRecordById, getRecordsConditionally, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getAcknowledgedStarterSettings, getStarterDefaultSettings, starterAcknowledgedSettings } from "../services/db/settings-services.js";
import { handleJsonParseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class StarterDefaultSettingsHandlers {
    getStarterDefaultSettingsHandler = async (c) => {
        try {
            const defaultSettings = await getStarterDefaultSettings();
            return sendResponse(c, 200, DEFAULT_SETTINGS_FETCHED, defaultSettings[0]);
        }
        catch (error) {
            console.error("Error at add starter default settings :", error);
            handleJsonParseError(error);
            console.error("Error at add starter default settings :", error);
            throw error;
        }
    };
    updateStarterDefaultSettingsHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const defaultSettingId = +c.req.param("id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validatedBody = await validatedRequest("update-default-settings", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA);
            const defaultSettingData = await getSingleRecordByAColumnValue(starterDefaultSettings, "id", "=", defaultSettingId);
            if (!defaultSettingData)
                throw new BadRequestException(DEFAULT_SETTINGS_NOT_FOUND);
            const { id, created_at, updated_at, ...rest } = defaultSettingData;
            const changedOldData = {};
            const changedNewData = {};
            for (const key of Object.keys(validatedBody)) {
                const oldValue = rest[key];
                const newValue = validatedBody[key];
                // strict comparison to avoid false positives
                if (newValue !== undefined && oldValue !== newValue) {
                    changedOldData[key] = oldValue;
                    changedNewData[key] = newValue;
                }
            }
            await db.transaction(async (trx) => {
                await updateRecordById(starterDefaultSettings, Number(defaultSettingData.id), validatedBody, trx);
                // Add activity log if needed (currently not in service, but let's be consistent)
                await ActivityService.logActivity({
                    performedBy: userPayload.id, // System or current user if available
                    action: "DEFAULT_SETTINGS_UPDATED",
                    entityType: "SETTING",
                    entityId: Number(defaultSettingData.id),
                    oldData: changedOldData,
                    newData: changedNewData,
                }, trx);
            });
            return sendResponse(c, 200, DEFAULT_SETTINGS_UPDATED);
        }
        catch (error) {
            console.error("Error at update starter default settings :", error);
            handleJsonParseError(error);
            console.error("Error at update starter default settings :", error);
            throw error;
        }
    };
    getAcknowledgedStarterSettingsHandler = async (c) => {
        try {
            const starterId = +c.req.param("starter_id");
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            const starterSettings = await starterAcknowledgedSettings(starterId);
            return sendResponse(c, 200, SETTINGS_FETCHED, starterSettings);
        }
        catch (error) {
            console.error("Error at add starter default settings :", error);
            throw error;
        }
    };
    insertStarterSettingHandler = async (c) => {
        try {
            const user = c.get("user_payload");
            const starterId = Number(c.req.param("starter_id"));
            const body = await c.req.json();
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter) {
                throw new BadRequestException(DEVICE_NOT_FOUND);
            }
            const validatedBody = await validatedRequest("update-default-settings", body, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);
            // const cleanedBody = removeEmptyObjectsDeep(validatedBody);
            // if (!Object.keys(cleanedBody).length) {
            //   throw new BadRequestException("No valid settings provided");
            // }
            // const oldSettings = (await getSingleRecordByMultipleColumnValues<StarterSettingsTable>(starterSettings,
            //   ["starter_id", "is_new_configuration_saved", "acknowledgement"],
            //   ["=", "=", "="],
            //   [starterId, 1, "TRUE"]
            // )) || {};
            // const delta = buildCategoryPayloadFromFlat(oldSettings, cleanedBody, DEVICE_SCHEMA);
            // if (!Object.keys(delta).length) {
            //   return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
            // }
            // const devicePayload = prepareStarterSettingsData({ T: 4, S: randomSequenceNumber(), D: delta });
            // if (devicePayload?.D) {
            //   setImmediate(async () => {
            //     try {
            //       await publishMultipleTimesInBackground(devicePayload, starter);
            //     } catch (error) {
            //       // TODO: Remove catch only for logging
            //       logger.error("Background publish failed:", error);
            //       console.error("Background publish failed:", error);
            //     }
            //   });
            // }
            await db.transaction(async (trx) => {
                await saveSingleRecord(starterSettings, { ...validatedBody, starter_id: starter.id, created_by: user.id }, trx);
                // Handle activity logging for settings update
                // await ActivityService.writeStarterSettingsUpdatedLog(user.id, starter.id, oldSettings, { ...oldSettings, ...cleanedBody }, trx);
            });
            return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
        }
        catch (error) {
            console.error("Error at insert Starter Setting:", error);
            throw error;
        }
    };
    getStarterSettingsLimitsHandler = async (c) => {
        try {
            const starterId = +c.req.param("starter_id");
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            const limits = await getSingleRecordByAColumnValue(starterSettingsLimits, "starter_id", "=", starterData.id);
            return sendResponse(c, 200, SETTINGS_LIMITS_FETCHED, limits);
        }
        catch (error) {
            console.error("Error at getStarterSettingsLimits:", error);
            throw error;
        }
    };
    updateStarterSettingsLimitsHandler = async (c) => {
        try {
            const settingId = +c.req.param("id");
            const body = await c.req.json();
            const foundedSettingId = await getRecordById(starterSettingsLimits, settingId);
            if (!foundedSettingId)
                throw new BadRequestException(SETTINGS_LIMITS_NOT_FOUND);
            await updateRecordById(starterSettingsLimits, settingId, body);
            return sendResponse(c, 200, SETTINGS_LIMITS_UPDATED);
        }
        catch (error) {
            console.error("Error at updateStarterSettingsLimits:", error);
            throw error;
        }
    };
    getStarterAckHistoryHandler = async (c) => {
        try {
            const starterId = +c.req.param("starter_id");
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            const whereQuery = {
                columns: ["starter_id"],
                relations: ["="],
                values: [starterData.id],
            };
            const ackHistory = await getRecordsConditionally(starterSettings, whereQuery, ["id", "acknowledgement", "time_stamp", "created_at", "updated_at"]);
            return sendResponse(c, 200, SETTINGS_FETCHED, ackHistory);
        }
        catch (error) {
            console.error("Error at getStarterAckHistory:", error);
            throw error;
        }
    };
    getStarterSettingDetailsMobileHandler = async (c) => {
        try {
            const starterId = +c.req.param("starter_id");
            const query = c.req.query();
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            const defaultColumns = ["id", "starter_id", "lvf", "hvf", "time_stamp"];
            let columnsToFetch = defaultColumns;
            if (query.columns) {
                const extraColumns = query.columns.split(",");
                columnsToFetch = getTableColumnsWithDefaults(starterSettings, defaultColumns, extraColumns);
            }
            const columnsToFetchObj = columnsToFetch.reduce((obj, column) => { obj[column] = true; return obj; }, {});
            const response = await getAcknowledgedStarterSettings(starterId, columnsToFetchObj);
            return sendResponse(c, 200, SETTINGS_FETCHED, response);
        }
        catch (error) {
            console.error("Error at get starter setting details in Mobile:", error);
            throw error;
        }
    };
    getStarterSettingsLimitsMobileHandler = async (c) => {
        try {
            const starterId = +c.req.param("starter_id");
            const query = c.req.query();
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            const defaultColumns = ["id", "starter_id", "lvf_min", "lvf_max", "hvf_min", "hvf_max", "created_at"];
            let columnsToFetch = defaultColumns;
            if (query.columns) {
                const extraColumns = query.columns.split(",");
                columnsToFetch = getTableColumnsWithDefaults(starterSettingsLimits, defaultColumns, extraColumns);
            }
            const response = await getSingleRecordByAColumnValue(starterSettingsLimits, "starter_id", "=", [starterId], columnsToFetch);
            return sendResponse(c, 200, SETTINGS_LIMITS_FETCHED, response);
        }
        catch (error) {
            console.error("Error at get starter setting details in Mobile:", error);
            throw error;
        }
    };
}
