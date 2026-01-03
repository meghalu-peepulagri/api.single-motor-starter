import { DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_UPDATED, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterDefaultSettings } from "../database/schemas/starter-default-settings.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { updateRecordById } from "../services/db/base-db-services.js";
import { getStarterDefaultSettings } from "../services/db/settings-services.js";
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
            await updateRecordById(starterDefaultSettings, defaultSettingId, validatedBody);
            return sendResponse(c, 200, DEFAULT_SETTINGS_UPDATED);
        }
        catch (error) {
            console.error("Error at update starter default settings :", error);
            handleJsonParseError(error);
            console.error("Error at update starter default settings :", error);
            throw error;
        }
    };
}
