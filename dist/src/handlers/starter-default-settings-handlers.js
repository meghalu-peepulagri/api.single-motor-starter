import { ADDED_STARTER_SETTINGS, DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_NOT_FOUND, DEFAULT_SETTINGS_UPDATED, DEVICE_NOT_FOUND, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA, SETTINGS_FETCHED, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { starterDefaultSettings } from "../database/schemas/starter-default-settings.js";
import { starterSettings } from "../database/schemas/starter-settings.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getStarterDefaultSettings, starterAcknowledgedSettings } from "../services/db/settings-services.js";
import { handleJsonParseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import { prepareSettingsData } from "../helpers/settings-helpers.js";
import { publishStarterSettings } from "../services/db/mqtt-db-services.js";
import { buildCategoryPayload, randomSequenceNumber } from "../helpers/mqtt-helpers.js";
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
            const userPayload = c.get("user_payload");
            const starterId = +c.req.param("starter_id");
            const reqBody = await c.req.json();
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            const validatedBody = await validatedRequest("update-default-settings", reqBody, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);
            const updatedSettings = await saveSingleRecord(starterSettings, {
                starter_id: Number(starterData.id),
                created_by: userPayload.id,
                pcb_number: String(starterData.pcb_number),
                ...validatedBody,
            });
            const oldSettings = starterData || {};
            const newSettings = updatedSettings || validatedBody;
            const dynamicPayload = { T: 13, S: randomSequenceNumber(), D: buildCategoryPayload(oldSettings, newSettings) };
            if (!dynamicPayload.D || Object.keys(dynamicPayload.D).length === 0 || !starterData.pcb_number) {
                throw new BadRequestException("Failed to add starter settings");
            }
            await publishStarterSettings(dynamicPayload, String(starterData.pcb_number));
            return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
        }
        catch (error) {
            console.error("Error at add starter default settings :", error);
            throw error;
        }
    };
}
