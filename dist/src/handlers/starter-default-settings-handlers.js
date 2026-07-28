import { ADDED_STARTER_SETTINGS, DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_LIMITS_FETCHED, DEFAULT_SETTINGS_LIMITS_NOT_FOUND, DEFAULT_SETTINGS_LIMITS_UPDATED, DEFAULT_SETTINGS_NOT_FOUND, DEFAULT_SETTINGS_UPDATED, DEVICE_NOT_FOUND, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA, MOTOR_CONTROL_MOTORS_NOT_FOUND, SETTINGS_FETCHED, SETTINGS_LIMITS_FETCHED, SETTINGS_LIMITS_NOT_FOUND, SETTINGS_LIMITS_UPDATED, SETTINGS_FIELD_NAMES, UPDATE_DEFAULT_SETTINGS_LIMITS_VALIDATION_CRITERIA, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { starterDefaultSettings } from "../database/schemas/starter-default-settings.js";
import { StarterDefaultSettingsLimits } from "../database/schemas/starter-default-settings-limits.js";
import { starterSettingsLimits } from "../database/schemas/starter-settings-limits.js";
import { starterSettings } from "../database/schemas/starter-settings.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getRecordById, getRecordsConditionally, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getAcknowledgedStarterSettings, getStarterDefaultSettings, starterAcknowledgedSettings } from "../services/db/settings-services.js";
import { getMotorsForStarterControl } from "../services/db/motor-services.js";
import { handleJsonParseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import { logger } from "../utils/logger.js";
import { sql } from "drizzle-orm";
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
            const defaultSettingId = +(c.req.param("id") ?? 0);
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validatedBody = await validatedRequest("update-default-settings", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA);
            // motor_starter_type, validated on its own: vUpdateDefaultSettings' output is also
            // spread into starter_settings inserts, and that table has no such column.
            const starterTypeBody = await validatedRequest("default-settings-starter-type", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA);
            // Write it only when a value actually arrived — the screen posts explicit nulls for
            // anything unset, and a null must not overwrite the stored choice.
            const starterTypeUpdate = starterTypeBody.motor_starter_type
                ? { motor_starter_type: starterTypeBody.motor_starter_type }
                : {};
            const defaultSettingData = await getSingleRecordByAColumnValue(starterDefaultSettings, "id", "=", defaultSettingId);
            if (!defaultSettingData)
                throw new BadRequestException(DEFAULT_SETTINGS_NOT_FOUND);
            const { id, created_at, updated_at, ...rest } = defaultSettingData;
            const updatePayload = { ...validatedBody, ...starterTypeUpdate };
            const changedOldData = {};
            const changedNewData = {};
            for (const key of Object.keys(updatePayload)) {
                const oldValue = rest[key];
                const newValue = updatePayload[key];
                // strict comparison to avoid false positives
                if (newValue !== undefined && oldValue !== newValue) {
                    changedOldData[key] = oldValue;
                    changedNewData[key] = newValue;
                }
            }
            const defaultSettingChangeSummary = Object.keys(changedNewData)
                .map(k => {
                const label = SETTINGS_FIELD_NAMES[k] ?? k;
                return `'${label}': ${changedOldData[k]} → ${changedNewData[k]}`;
            })
                .join(', ');
            await db.transaction(async (trx) => {
                await updateRecordById(starterDefaultSettings, Number(defaultSettingData.id), updatePayload, trx);
                await ActivityService.logActivity({
                    performedBy: c.get("performer_id"),
                    action: "DEFAULT_SETTINGS_UPDATED",
                    entityType: "SETTING",
                    entityId: Number(defaultSettingData.id),
                    oldData: changedOldData,
                    newData: changedNewData,
                    message: defaultSettingChangeSummary ? `Default settings updated — ${defaultSettingChangeSummary}` : "Default settings updated",
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
            const starterId = +(c.req.param("starter_id") ?? 0);
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
            const starterId = Number(c.req.param("starter_id") ?? 0);
            const body = await c.req.json();
            const starter = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
            if (!starter) {
                throw new BadRequestException(DEVICE_NOT_FOUND);
            }
            // MULTI_STARTER uses the per-motor path ONLY when the frontend actually sends the
            // grouped/per-motor payload (dvc_c / m1 / m2, or a motors[] array). A flat payload
            // (the standard starter_settings shape) falls through to the normal path below and
            // is stored in the flat columns, same as single-motor.
            // Detect the multi-motor payload in ANY shape: dvc_c (raw or { T,S,D } wrapped),
            // a motors[] array, or top-level m1/m2 blocks added to the flat payload.
            const settingsD = body?.D ?? body;
            const settingsDvc = settingsD?.dvc_c ?? settingsD;
            const isMultiMotorPayload = !!(settingsDvc?.m1 || settingsDvc?.m2 || Array.isArray(settingsD?.motors));
            if (starter.starter_type === "MULTI_STARTER" && isMultiMotorPayload) {
                await this.insertMultiMotorStarterSetting(c, starter, body);
                return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
            }
            const validatedBody = await validatedRequest("update-default-settings", body, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);
            const oldSettings = await getSingleRecordByMultipleColumnValues(starterSettings, ["starter_id", "acknowledgement"], ["=", "="], [starter.id, "TRUE"]) ?? {};
            await db.transaction(async (trx) => {
                await saveSingleRecord(starterSettings, { ...validatedBody, starter_id: starter.id, created_by: user.id }, trx);
                await ActivityService.writeStarterSettingsUpdatedLog(user.id, starter.id, oldSettings, validatedBody, trx, starter.pcb_number);
            });
            return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
        }
        catch (error) {
            console.error("Error at insert Starter Setting:", error);
            throw error;
        }
    };
    // MULTI_STARTER insert path: shared box-level fields (v_flt_en, sd_time) + one
    // block per motor, stored together as a single JSON column (starter_settings.
    // multi_motor_config) rather than a child table — see the schema file for why.
    // Motor resolution mirrors controlMotorsHandler/controlMotorsModeHandler in
    // motor-handlers.ts: motor_reference takes precedence over motor_id.
    insertMultiMotorStarterSetting = async (c, starter, body) => {
        const user = c.get("user_payload");
        // Normalize any shape the frontend may send into { v_flt_en, sd_time, motors: [...] }:
        //  - { T, S, D: { ... } }         -> unwrap D
        //  - { dvc_c: { m1, m2 }, clb }   -> per-motor under dvc_c
        //  - { m1, m2, ... }              -> top-level per-motor blocks (added to the flat payload)
        //  - { motors: [...] }            -> already flat
        const D = body?.D ?? body;
        const dvc = D?.dvc_c ?? D;
        const clb = D?.clb ?? {};
        const flatBody = (dvc?.m1 || dvc?.m2 || Array.isArray(D?.motors))
            ? {
                v_flt_en: dvc?.v_flt_en,
                sd_time: dvc?.sd_time,
                motors: Array.isArray(D?.motors)
                    ? D.motors
                    : ["m1", "m2"]
                        .filter((k) => dvc?.[k] || clb?.[`${k}_clb`])
                        .map((k) => ({
                        motor_reference: k,
                        ...(dvc?.[k] ?? {}),
                        ...(clb?.[`${k}_clb`] ?? {}),
                    })),
            }
            : body;
        const validatedBody = await validatedRequest("update-multi-motor-settings", flatBody, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);
        // Also validate the device-level flat fields (faults thresholds, primary-fault toggles,
        // calibration, timing) that accompany the per-motor blocks, so they're stored too.
        // `dvc` is the flat body (top-level flat payload) or dvc_c contents — both hold device fields;
        // the m1/m2 objects it may also contain are simply stripped by the validator.
        const validatedDeviceSettings = await validatedRequest("update-default-settings", dvc, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);
        const starterMotors = await getMotorsForStarterControl(starter.id);
        const resolved = validatedBody.motors.map((entry) => {
            const motor = entry.motor_reference
                ? starterMotors.find((sm) => sm.motor_reference === entry.motor_reference)
                : starterMotors.find((sm) => sm.id === entry.motor_id);
            return motor ? { motor, entry } : null;
        });
        if (resolved.some((r) => r === null)) {
            throw new BadRequestException(MOTOR_CONTROL_MOTORS_NOT_FOUND);
        }
        const resolvedMotors = resolved;
        // The frontend sends a DIFF (only changed fields, possibly no box-level fields). Merge it into
        // the current config so unchanged M1/M2 values are preserved across saves.
        const oldSettings = await getSingleRecordByMultipleColumnValues(starterSettings, ["starter_id", "acknowledgement"], ["=", "="], [starter.id, "TRUE"]);
        const existingConfig = oldSettings?.multi_motor_config
            ?? { v_flt_en: 0, sd_time: 0, motors: [] };
        // Keep only keys the request actually sent, so a diff overlays without wiping the rest.
        const definedOnly = (obj) => Object.fromEntries(Object.entries(obj).filter(([, val]) => val !== undefined));
        const mergedMotors = existingConfig.motors.map((m) => ({ ...m }));
        for (const { motor, entry } of resolvedMotors) {
            const changed = definedOnly({
                flt_en: entry.flt_en, flc: entry.flc, f_dr: entry.f_dr, f_ol: entry.f_ol, f_lr: entry.f_lr,
                f_opf: entry.f_opf, f_ci: entry.f_ci, dr: entry.dr, ol: entry.ol, lr: entry.lr, ci: entry.ci,
                drf: entry.drf, olf: entry.olf, lrf: entry.lrf, opf: entry.opf, cif: entry.cif,
                olr: entry.olr, lrr: entry.lrr, cir: entry.cir,
                ig_r: entry.ig_r, ig_y: entry.ig_y, ig_b: entry.ig_b, io_r: entry.io_r, io_y: entry.io_y, io_b: entry.io_b,
            });
            const identity = { motor_id: motor.id, motor_index: motor.motor_index ?? undefined, motor_reference: motor.motor_reference ?? undefined };
            const idx = mergedMotors.findIndex((m) => m.motor_id === motor.id);
            if (idx >= 0) {
                mergedMotors[idx] = { ...mergedMotors[idx], ...changed, ...identity, acknowledgement: "FALSE" };
            }
            else {
                mergedMotors.push({ ...identity, ...changed, acknowledgement: "FALSE" });
            }
        }
        const multiMotorConfig = {
            v_flt_en: validatedBody.v_flt_en ?? existingConfig.v_flt_en,
            sd_time: validatedBody.sd_time ?? existingConfig.sd_time,
            motors: mergedMotors,
        };
        await db.transaction(async (trx) => {
            await saveSingleRecord(starterSettings, { ...validatedDeviceSettings, starter_id: starter.id, created_by: user.id, multi_motor_config: multiMotorConfig }, trx);
            await ActivityService.writeStarterSettingsUpdatedLog(user.id, starter.id, { multi_motor_config: oldSettings?.multi_motor_config ?? null }, { multi_motor_config: multiMotorConfig }, trx, starter.pcb_number);
        });
    };
    getStarterSettingsLimitsHandler = async (c) => {
        try {
            const starterId = +(c.req.param("starter_id") ?? 0);
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
            const userPayload = c.get("user_payload");
            const settingId = +(c.req.param("id") ?? 0);
            const body = await c.req.json();
            const { id, starter_id, created_at, updated_at, ...rest } = body;
            const foundedSettingId = await getRecordById(starterSettingsLimits, settingId);
            if (!foundedSettingId)
                throw new BadRequestException(SETTINGS_LIMITS_NOT_FOUND);
            const changedOldData = {};
            const changedNewData = {};
            for (const key of Object.keys(rest)) {
                const oldValue = foundedSettingId[key];
                const newValue = rest[key];
                if (newValue !== undefined && String(newValue) !== String(oldValue)) {
                    changedOldData[key] = oldValue;
                    changedNewData[key] = newValue;
                }
            }
            const starterForLimitsLog = foundedSettingId.starter_id
                ? await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [foundedSettingId.starter_id, "ARCHIVED"], ["pcb_number"])
                : null;
            await db.transaction(async (trx) => {
                await updateRecordById(starterSettingsLimits, foundedSettingId.id, rest, trx);
                await ActivityService.writeStarterSettingsUpdatedLog(userPayload.id, foundedSettingId.starter_id ?? foundedSettingId.id, changedOldData, changedNewData, trx, starterForLimitsLog?.pcb_number ?? null);
            });
            return sendResponse(c, 200, SETTINGS_LIMITS_UPDATED);
        }
        catch (error) {
            console.error("Error at updateStarterSettingsLimits:", error);
            throw error;
        }
    };
    getStarterAckHistoryHandler = async (c) => {
        try {
            const starterId = +(c.req.param("starter_id") ?? 0);
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
            const starterId = +(c.req.param("starter_id") ?? 0);
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
            const starterId = +(c.req.param("starter_id") ?? 0);
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
    getStarterDefaultSettingsLimitsHandler = async (c) => {
        try {
            const defaultSettingsLimits = await getRecordsConditionally(StarterDefaultSettingsLimits, undefined, undefined);
            if (!defaultSettingsLimits || defaultSettingsLimits.length === 0) {
                throw new BadRequestException(DEFAULT_SETTINGS_LIMITS_NOT_FOUND);
            }
            return sendResponse(c, 200, DEFAULT_SETTINGS_LIMITS_FETCHED, defaultSettingsLimits[0]);
        }
        catch (error) {
            console.error("Error at get starter default settings limits:", error);
            throw error;
        }
    };
    updateStarterDefaultSettingsLimitsHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const defaultSettingLimitsId = +(c.req.param("id") ?? 0);
            const reqBody = await c.req.json();
            const validatedBody = await validatedRequest("update-default-settings-limits", reqBody, UPDATE_DEFAULT_SETTINGS_LIMITS_VALIDATION_CRITERIA);
            const defaultSettingLimitsData = await getRecordById(StarterDefaultSettingsLimits, defaultSettingLimitsId);
            if (!defaultSettingLimitsData) {
                throw new BadRequestException(DEFAULT_SETTINGS_LIMITS_NOT_FOUND);
            }
            const { id, created_at, updated_at, ...rest } = defaultSettingLimitsData;
            const changedOldData = {};
            const changedNewData = {};
            // Track changes
            for (const key of Object.keys(validatedBody)) {
                const oldValue = rest[key];
                const newValue = validatedBody[key];
                if (newValue !== undefined && oldValue !== newValue) {
                    changedOldData[key] = oldValue;
                    changedNewData[key] = newValue;
                }
            }
            const defaultLimitsChangeSummary = Object.keys(changedNewData)
                .map(k => {
                const label = SETTINGS_FIELD_NAMES[k] ?? k;
                return `'${label}': ${changedOldData[k]} → ${changedNewData[k]}`;
            })
                .join(', ');
            await db.transaction(async (trx) => {
                await updateRecordById(StarterDefaultSettingsLimits, defaultSettingLimitsId, validatedBody, trx);
                await ActivityService.logActivity({
                    performedBy: c.get("performer_id"),
                    action: "DEFAULT_SETTINGS_LIMITS_UPDATED",
                    entityType: "SETTING",
                    entityId: defaultSettingLimitsId,
                    oldData: changedOldData,
                    newData: changedNewData,
                    message: defaultLimitsChangeSummary ? `Default settings limits updated — ${defaultLimitsChangeSummary}` : "Default settings limits updated",
                }, trx);
            });
            return sendResponse(c, 200, DEFAULT_SETTINGS_LIMITS_UPDATED);
        }
        catch (error) {
            console.error("Error at update starter default settings limits:", error);
            handleJsonParseError(error);
            throw error;
        }
    };
    updateLatestSettingAckByStarterHandler = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const starterId = +(c.req.param("starter_id") ?? 0);
            const starterData = await getSingleRecordByMultipleColumnValues(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["id", "pcb_number"]);
            if (!starterData)
                throw new BadRequestException(DEVICE_NOT_FOUND);
            await db.update(starterSettings).set({ acknowledgement: "TRUE", updated_at: sql `CURRENT_TIMESTAMP` }).where(sql `${starterSettings.id} = (SELECT ${starterSettings.id} FROM ${starterSettings} WHERE ${starterSettings.starter_id} = ${starterId} AND ${starterSettings.acknowledgement} = 'FALSE' ORDER BY ${starterSettings.created_at} DESC LIMIT 1)`);
            await ActivityService.logActivity({
                performedBy: userPayload.id,
                action: "SETTINGS_ACK_UPDATED",
                entityType: "SETTING",
                entityId: starterData.id,
                newData: { acknowledgement: "TRUE", starter_id: starterData.id, pcb_number: starterData.pcb_number },
                message: starterData.pcb_number ? `Settings acknowledged by device '${starterData.pcb_number}'` : "Settings acknowledged by device",
            });
            return sendResponse(c, 200, "Settings updated successfully");
        }
        catch (error) {
            logger.error("Error at updating latest starter setting acknowledgement updated_at:", error);
            console.error("Error at updating latest starter setting acknowledgement updated_at:", error);
            throw error;
        }
    };
}
