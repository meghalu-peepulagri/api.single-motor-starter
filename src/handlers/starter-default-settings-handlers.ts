import type { Context } from "hono";
import { ADDED_STARTER_SETTINGS, DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_NOT_FOUND, DEFAULT_SETTINGS_UPDATED, DEVICE_NOT_FOUND, DEVICE_SCHEMA, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA, SETTINGS_FETCHED, SETTINGS_LIMITS_FETCHED, SETTINGS_LIMITS_NOT_FOUND, SETTINGS_LIMITS_UPDATED, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import { starterDefaultSettings, type StarterDefaultSettingsTable } from "../database/schemas/starter-default-settings.js";
import { starterSettingsLimits, type StarterSettingsLimitsTable } from "../database/schemas/starter-settings-limits.js";
import { starterSettings, type StarterSettingsTable } from "../database/schemas/starter-settings.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { buildCategoryPayloadFromFlat, randomSequenceNumber, removeEmptyObjectsDeep } from "../helpers/mqtt-helpers.js";
import { getRecordById, getRecordsConditionally, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getStarterDefaultSettings, prepareStarterSettingsData, starterAcknowledgedSettings } from "../services/db/settings-services.js";
import { handleJsonParseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedUpdateDefaultSettings } from "../validations/schema/default-settings.js";
import { validatedRequest } from "../validations/validate-request.js";
import { publishMultipleTimesInBackground } from "../helpers/settings-helpers.js";
import type { WhereQueryData } from "../types/db-types.js";

const paramsValidateException = new ParamsValidateException();

export class StarterDefaultSettingsHandlers {

  getStarterDefaultSettingsHandler = async (c: Context) => {
    try {
      const defaultSettings = await getStarterDefaultSettings();
      return sendResponse(c, 200, DEFAULT_SETTINGS_FETCHED, defaultSettings[0]);
    } catch (error: any) {
      console.error("Error at add starter default settings :", error);
      handleJsonParseError(error);
      console.error("Error at add starter default settings :", error);
      throw error;
    }
  };

  updateStarterDefaultSettingsHandler = async (c: Context) => {
    try {
      const defaultSettingId = +c.req.param("id");
      const reqBody = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqBody);
      const validatedBody = await validatedRequest<ValidatedUpdateDefaultSettings>("update-default-settings", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA);
      const defaultSettingData: StarterDefaultSettingsTable = await getSingleRecordByAColumnValue<StarterDefaultSettingsTable>(starterDefaultSettings, "id", "=", defaultSettingId, ["id"]);
      if (!defaultSettingData) throw new BadRequestException(DEFAULT_SETTINGS_NOT_FOUND);

      await updateRecordById<StarterDefaultSettingsTable>(starterDefaultSettings, Number(defaultSettingData.id), validatedBody);
      return sendResponse(c, 200, DEFAULT_SETTINGS_UPDATED);
    } catch (error: any) {
      console.error("Error at update starter default settings :", error);
      handleJsonParseError(error);
      console.error("Error at update starter default settings :", error);
      throw error;
    }
  };

  getAcknowledgedStarterSettingsHandler = async (c: Context) => {
    try {

      const starterId = +c.req.param("starter_id");
      const starterData: StarterBoxTable = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      const starterSettings = await starterAcknowledgedSettings(starterId);
      return sendResponse(c, 200, SETTINGS_FETCHED, starterSettings);
    } catch (error: any) {
      console.error("Error at add starter default settings :", error);
      throw error;
    }
  };

  insertStarterSettingHandler = async (c: Context) => {
    try {
      const user = c.get("user_payload");
      const starterId = Number(c.req.param("starter_id"));
      const body = await c.req.json();

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes,
        ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]
      );

      if (!starter) {
        throw new BadRequestException(DEVICE_NOT_FOUND);
      }

      const validatedBody = await validatedRequest<ValidatedUpdateDefaultSettings>("update-default-settings",
        body, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);

      const cleanedBody = removeEmptyObjectsDeep(validatedBody);
      if (!Object.keys(cleanedBody).length) {
        throw new BadRequestException("No valid settings provided");
      }

      const oldSettings = (await getSingleRecordByMultipleColumnValues<StarterSettingsTable>(starterSettings,
        ["starter_id", "pcb_number", "is_new_configuration_saved", "acknowledgement"],
        ["=", "=", "=", "="],
        [starterId, starter.pcb_number, 1, "TRUE"]
      )) || {};

      const delta = buildCategoryPayloadFromFlat(oldSettings, cleanedBody, DEVICE_SCHEMA);

      if (!Object.keys(delta).length) {
        return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
      }

      const devicePayload = prepareStarterSettingsData({ T: 13, S: randomSequenceNumber(), D: delta });

      if (devicePayload?.D) {
        setImmediate(async () => {
          try {
            await publishMultipleTimesInBackground(devicePayload, String(starter.pcb_number), starter.id);
          } catch (error) {
            // TODO: Remove catch only for logging
            console.error("Background publish failed:", error);
          }
        });
      }

      await saveSingleRecord<StarterSettingsTable>(starterSettings, { ...cleanedBody, starter_id: starter.id, pcb_number: String(starter.pcb_number), created_by: user.id });
      return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
    } catch (error: any) {
      console.error("Error at insertStarterSetting:", error);
      throw error;
    }
  };

  getStarterSettingsLimitsHandler = async (c: Context) => {
    try {
      const starterId = +c.req.param("starter_id");
      const starterData: StarterBoxTable = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      const limits = await getSingleRecordByAColumnValue<StarterSettingsLimitsTable>(starterSettingsLimits, "starter_id", "=", starterData.id);
      return sendResponse(c, 200, SETTINGS_LIMITS_FETCHED, limits);
    } catch (error) {
      console.error("Error at getStarterSettingsLimits:", error);
      throw error;
    }
  };

  updateStarterSettingsLimitsHandler = async (c: Context) => {
    try {
      const settingId = +c.req.param("id");
      const body = await c.req.json();

      const foundedSettingId = await getRecordById<StarterSettingsLimitsTable>(starterSettingsLimits, settingId);
      if (!foundedSettingId) throw new BadRequestException(SETTINGS_LIMITS_NOT_FOUND);

      await updateRecordById<StarterSettingsLimitsTable>(starterSettingsLimits, settingId, body);
      return sendResponse(c, 200, SETTINGS_LIMITS_UPDATED);
    } catch (error) {
      console.error("Error at updateStarterSettingsLimits:", error);
      throw error;
    }
  };

  getStarterAckHistoryHandler = async (c: Context) => {
    try {
      const starterId = +c.req.param("starter_id");
      const starterData: StarterBoxTable = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      const whereQuery: WhereQueryData<StarterSettingsTable> = {
        columns: ["starter_id"],
        relations: ["="],
        values: [starterData.id],
      }

      const ackHistory = await getRecordsConditionally<StarterSettingsTable>(starterSettings, whereQuery, ["id", "acknowledgement", "time_stamp", "created_at", "updated_at"]);
      return sendResponse(c, 200, SETTINGS_FETCHED, ackHistory);
    } catch (error) {
      console.error("Error at getStarterAckHistory:", error);
      throw error;
    }
  };
}