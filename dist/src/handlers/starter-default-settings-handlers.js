import { ADDED_STARTER_SETTINGS, DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_NOT_FOUND, DEFAULT_SETTINGS_UPDATED, DEVICE_NOT_FOUND, DEVICE_SCHEMA, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA, SETTINGS_FETCHED, SETTINGS_LIMITS_FETCHED, SETTINGS_LIMITS_NOT_FOUND, SETTINGS_LIMITS_UPDATED, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA, UPDATE_STARTER_SETTINGS_LIMITS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { starterDefaultSettings } from "../database/schemas/starter-default-settings.js";
import { starterSettingsLimits } from "../database/schemas/starter-settings-limits.js";
import { starterSettings } from "../database/schemas/starter-settings.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { buildCategoryPayloadFromFlat, publishWithRetry, randomSequenceNumber, removeEmptyObjectsDeep } from "../helpers/mqtt-helpers.js";
import { getRecordById, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, updateRecordById } from "../services/db/base-db-services.js";
import { publishStarterSettings } from "../services/db/mqtt-db-services.js";
import { getStarterDefaultSettings, prepareStarterSettingsData, starterAcknowledgedSettings } from "../services/db/settings-services.js";
import { handleJsonParseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class StarterDefaultSettingsHandlers {
    getStarterDefaultSettings = async (c) => {
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
    updateStarterDefaultSettings = async (c) => {
        try {
            const defaultSettingId = +c.req.param("id");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validatedBody = await validatedRequest("update-default-settings", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA);
            const defaultSettingData = await getSingleRecordByAColumnValue(starterDefaultSettings, "id", "=", defaultSettingId, ["id"]);
            if (!defaultSettingData)
                throw new BadRequestException(DEFAULT_SETTINGS_NOT_FOUND);
            await updateRecordById(starterDefaultSettings, Number(defaultSettingData.id), validatedBody);
            return sendResponse(c, 200, DEFAULT_SETTINGS_UPDATED);
        }
        catch (error) {
            console.error("Error at update starter default settings :", error);
            handleJsonParseError(error);
            console.error("Error at update starter default settings :", error);
            throw error;
        }
    };
    getAcknowledgedStarterSettings = async (c) => {
        try {
            const userPayload = c.get("user_payload");
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
    insertStarterSetting = async (c) => {
        try {
            const user = c.get("user_payload");
            const starterId = Number(c.req.param("starter_id"));
            const body = await c.req.json();
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter) {
                throw new BadRequestException(DEVICE_NOT_FOUND);
            }
            const validatedBody = await validatedRequest("update-default-settings", body, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);
            const cleanedBody = removeEmptyObjectsDeep(validatedBody);
            if (!Object.keys(cleanedBody).length) {
                throw new BadRequestException("No valid settings provided");
            }
            const oldSettings = await getSingleRecordByMultipleColumnValues(starterSettings, ["starter_id", "pcb_number", "is_new_configuration_saved", "acknowledgement"], ["=", "=", "=", "="], [starterId, starter.pcb_number, 1, "TRUE"]) || {};
            const delta = buildCategoryPayloadFromFlat(oldSettings, cleanedBody, DEVICE_SCHEMA);
            if (!Object.keys(delta).length) {
                return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
            }
            const devicePayload = prepareStarterSettingsData({ T: 13, S: randomSequenceNumber(), D: delta });
            if (!devicePayload?.D) {
                return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
            }
            const retryOptions = {
                attempts: 3,
                delaysBeforeSendMs: [5000, 5000, 3000],
                ackTimeoutsMs: [0, 0, 0],
            };
            if (devicePayload?.D) {
                const result = await publishWithRetry(async () => {
                    await publishStarterSettings(devicePayload, String(starter.pcb_number));
                }, retryOptions);
                if (!result.success) {
                    throw new BadRequestException("Failed to publish settings");
                }
            }
            return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
        }
        catch (error) {
            console.error("Error at insertStarterSetting:", error);
            throw error;
        }
    };
    getStarterSettingsLimits = async (c) => {
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
    updateStarterSettingsLimits = async (c) => {
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
}
