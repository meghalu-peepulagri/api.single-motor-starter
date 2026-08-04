import type { Context } from "hono";
import { ADDED_STARTER_SETTINGS, DEFAULT_SETTINGS_FETCHED, DEFAULT_SETTINGS_LIMITS_FETCHED, DEFAULT_SETTINGS_LIMITS_NOT_FOUND, DEFAULT_SETTINGS_LIMITS_UPDATED, DEFAULT_SETTINGS_NOT_FOUND, DEFAULT_SETTINGS_UPDATED, DEVICE_NOT_FOUND, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA, MOTOR_CONTROL_MOTORS_NOT_FOUND, SETTINGS_FETCHED, SETTINGS_LIMITS_FETCHED, SETTINGS_LIMITS_NOT_FOUND, SETTINGS_LIMITS_UPDATED, SETTINGS_FIELD_NAMES, UPDATE_DEFAULT_SETTINGS_LIMITS_VALIDATION_CRITERIA, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import db from "../database/configuration.js";
import { starterBoxes, type StarterBoxTable } from "../database/schemas/starter-boxes.js";
import { starterDefaultSettings, type StarterDefaultSettingsTable } from "../database/schemas/starter-default-settings.js";
import { StarterDefaultSettingsLimits, type StarterDefaultSettingsLimitsTable } from "../database/schemas/starter-default-settings-limits.js";
import { starterSettingsLimits, type StarterSettingsLimitsTable } from "../database/schemas/starter-settings-limits.js";
import { starterSettings, type StarterSettingsTable } from "../database/schemas/starter-settings.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getRecordById, getRecordsConditionally, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, getTableColumnsWithDefaults, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getAcknowledgedStarterSettings, getStarterDefaultSettings, starterAcknowledgedSettings } from "../services/db/settings-services.js";
import { getMotorsForStarterControl } from "../services/db/motor-services.js";
import type { WhereQueryData } from "../types/db-types.js";
import { handleJsonParseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedDefaultSettingsStarterType, ValidatedUpdateDefaultSettings } from "../validations/schema/default-settings.js";
import type { ValidatedUpdateDefaultSettingsLimits } from "../validations/schema/default-settings-limits.js";
import type { ValidatedUpdateMultiMotorSettings } from "../validations/schema/multi-motor-settings-validations.js";
import { validatedRequest } from "../validations/validate-request.js";
import { logger } from "../utils/logger.js";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { MultiMotorSettingsConfig } from "../types/multi-motor-settings-types.js";

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
      const userPayload = c.get("user_payload");
      const defaultSettingId = +(c.req.param("id") ?? 0);
      const reqBody = await c.req.json();
      paramsValidateException.emptyBodyValidation(reqBody);
      const validatedBody = await validatedRequest<ValidatedUpdateDefaultSettings>("update-default-settings", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA);

      // motor_starter_type, validated on its own: vUpdateDefaultSettings' output is also
      // spread into starter_settings inserts, and that table has no such column.
      const starterTypeBody = await validatedRequest<ValidatedDefaultSettingsStarterType>(
        "default-settings-starter-type", reqBody, UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA
      );
      // Write it only when a value actually arrived — the screen posts explicit nulls for
      // anything unset, and a null must not overwrite the stored choice.
      const starterTypeUpdate = starterTypeBody.motor_starter_type
        ? { motor_starter_type: starterTypeBody.motor_starter_type }
        : {};

      const defaultSettingData = await getSingleRecordByAColumnValue<StarterDefaultSettingsTable>(starterDefaultSettings, "id", "=", defaultSettingId);
      if (!defaultSettingData) throw new BadRequestException(DEFAULT_SETTINGS_NOT_FOUND);
      const { id, created_at, updated_at, ...rest } = defaultSettingData;

      const updatePayload = { ...validatedBody, ...starterTypeUpdate };

      const changedOldData: Record<string, any> = {};
      const changedNewData: Record<string, any> = {};

      for (const key of Object.keys(updatePayload)) {
        const oldValue = (rest as any)[key];
        const newValue = (updatePayload as any)[key];

        // strict comparison to avoid false positives
        if (newValue !== undefined && oldValue !== newValue) {
          changedOldData[key] = oldValue;
          changedNewData[key] = newValue;
        }
      }

      const defaultSettingChangeSummary = Object.keys(changedNewData)
        .map(k => {
          const label = (SETTINGS_FIELD_NAMES as any)[k] ?? k;
          return `'${label}': ${changedOldData[k]} → ${changedNewData[k]}`;
        })
        .join(', ');

      await db.transaction(async (trx) => {
        await updateRecordById<StarterDefaultSettingsTable>(starterDefaultSettings, Number(defaultSettingData.id), updatePayload, trx);
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
    } catch (error: any) {
      console.error("Error at update starter default settings :", error);
      handleJsonParseError(error);
      console.error("Error at update starter default settings :", error);
      throw error;
    }
  };

  getAcknowledgedStarterSettingsHandler = async (c: Context) => {
    try {
      const starterId = +(c.req.param("starter_id") ?? 0);
      const starterData = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      const starterSettings = await starterAcknowledgedSettings(starterId);

      // Surface the box's starter/support type at the top level too. The nested `starter`
      // object carries them as well, but a box with no acknowledged settings row yet has no
      // nested object at all, and the screen still needs the two types to render.
      const responseData = {
        ...(starterSettings ?? {}),
        motor_starter_type: starterData.motor_starter_type,
        motor_support_type: starterData.motor_support_type,
      };

      return sendResponse(c, 200, SETTINGS_FETCHED, responseData);
    } catch (error: any) {
      console.error("Error at add starter default settings :", error);
      throw error;
    }
  };

  insertStarterSettingHandler = async (c: Context) => {
    try {
      const user = c.get("user_payload");
      const starterId = Number(c.req.param("starter_id") ?? 0);
      const body = await c.req.json();

      const starter = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes,
        ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]
      );

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

      const validatedBody = await validatedRequest<ValidatedUpdateDefaultSettings>("update-default-settings",
        body, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA);

      const oldSettings = await getSingleRecordByMultipleColumnValues<StarterSettingsTable>(
        starterSettings,
        ["starter_id", "acknowledgement"],
        ["=", "="],
        [starter.id, "TRUE"]
      ) ?? {};

      // Every save inserts a NEW row, so any column the flat payload doesn't carry starts
      // out empty. For a MULTI_STARTER box that means multi_motor_config would land as
      // NULL and the per-motor block would be lost — which is what happens when the mobile
      // app posts a flat payload (no dvc_c / m1 / m2 / motors[]). Carry the existing block
      // forward; the multi-motor path above still owns updating it when the payload
      // actually contains per-motor data.
      // Read from the most recent row that still HAS a block, not merely the most recent
      // acknowledged one: once a flat save has already nulled it, the newest row carries
      // nothing and the block would stay lost forever.
      const lastConfigRow = starter.starter_type === "MULTI_STARTER"
        ? await db.query.starterSettings.findFirst({
            where: and(eq(starterSettings.starter_id, starter.id), isNotNull(starterSettings.multi_motor_config)),
            orderBy: desc(starterSettings.id),
            columns: { multi_motor_config: true },
          })
        : undefined;
      const storedConfig = (lastConfigRow?.multi_motor_config ?? null) as MultiMotorSettingsConfig | null;

      // The mobile app posts the whole settings record back, multi_motor_config included,
      // with its per-motor edits inside it — but without the top-level m1/m2 blocks the web
      // sends, so it never reaches the multi-motor path above. Merge the request's block
      // over the stored one; otherwise the carry-forward would put the stale per-motor
      // values back and FLC / current protection would never change.
      const incomingConfig = body?.multi_motor_config;
      let nextConfig = storedConfig;

      if (starter.starter_type === "MULTI_STARTER" && Array.isArray(incomingConfig?.motors) && incomingConfig.motors.length > 0) {
        const validatedConfig = await validatedRequest<ValidatedUpdateMultiMotorSettings>(
          "update-multi-motor-settings", incomingConfig, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA
        );

        // Keep only the fields the request actually sent, so a partial motor block overlays
        // rather than wiping the rest. Identity fields are taken from the stored block.
        const sentFieldsOf = (entry: Record<string, any>) => Object.fromEntries(
          Object.entries(entry).filter(([key, value]) =>
            value !== undefined && key !== "motor_id" && key !== "motor_reference")
        );

        const incomingById = new Map(
          validatedConfig.motors
            .filter((m) => m.motor_id !== undefined && m.motor_id !== null)
            .map((m) => [m.motor_id as number, m])
        );

        const mergedMotors = (storedConfig?.motors ?? []).map((motorBlock) => {
          const incoming = incomingById.get(motorBlock.motor_id);
          if (!incoming) return motorBlock;
          incomingById.delete(motorBlock.motor_id);
          // Changed values need re-acknowledging by the device.
          return { ...motorBlock, ...sentFieldsOf(incoming), acknowledgement: "FALSE" as const };
        });

        // Motors sent for the first time (no stored block yet).
        for (const incoming of incomingById.values()) {
          mergedMotors.push({
            ...sentFieldsOf(incoming),
            motor_id: incoming.motor_id as number,
            motor_reference: incoming.motor_reference,
            acknowledgement: "FALSE" as const,
          });
        }

        nextConfig = {
          v_flt_en: validatedConfig.v_flt_en ?? storedConfig?.v_flt_en ?? 0,
          sd_time: validatedConfig.sd_time ?? storedConfig?.sd_time ?? 0,
          motors: mergedMotors,
        };
      }

      const carriedConfig = nextConfig ? { multi_motor_config: nextConfig } : {};

      await db.transaction(async (trx) => {
        await saveSingleRecord<StarterSettingsTable>(starterSettings, { ...validatedBody, ...carriedConfig, starter_id: starter.id, created_by: user.id }, trx);
        await ActivityService.writeStarterSettingsUpdatedLog(user.id, starter.id, oldSettings as Record<string, unknown>, validatedBody as Record<string, unknown>, trx, starter.pcb_number);
      });
      return sendResponse(c, 200, ADDED_STARTER_SETTINGS);
    } catch (error: any) {
      console.error("Error at insert Starter Setting:", error);
      throw error;
    }
  };

  // MULTI_STARTER insert path: shared box-level fields (v_flt_en, sd_time) + one
  // block per motor, stored together as a single JSON column (starter_settings.
  // multi_motor_config) rather than a child table — see the schema file for why.
  // Motor resolution mirrors controlMotorsHandler/controlMotorsModeHandler in
  // motor-handlers.ts: motor_reference takes precedence over motor_id.
  private insertMultiMotorStarterSetting = async (c: Context, starter: StarterBoxTable["$inferSelect"], body: any) => {
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
            : (["m1", "m2"] as const)
                .filter((k) => dvc?.[k] || clb?.[`${k}_clb`])
                .map((k) => ({
                  motor_reference: k,
                  ...(dvc?.[k] ?? {}),
                  ...(clb?.[`${k}_clb`] ?? {}),
                })),
        }
      : body;

    const validatedBody = await validatedRequest<ValidatedUpdateMultiMotorSettings>(
      "update-multi-motor-settings", flatBody, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA
    );

    // Also validate the device-level flat fields (faults thresholds, primary-fault toggles,
    // calibration, timing) that accompany the per-motor blocks, so they're stored too.
    // `dvc` is the flat body (top-level flat payload) or dvc_c contents — both hold device fields;
    // the m1/m2 objects it may also contain are simply stripped by the validator.
    const validatedDeviceSettings = await validatedRequest<ValidatedUpdateDefaultSettings>(
      "update-default-settings", dvc, INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA
    );

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
    const resolvedMotors = resolved as { motor: (typeof starterMotors)[number]; entry: (typeof validatedBody.motors)[number] }[];

    // The frontend sends a DIFF (only changed fields, possibly no box-level fields). Merge it into
    // the current config so unchanged M1/M2 values are preserved across saves.
    const oldSettings = await getSingleRecordByMultipleColumnValues<StarterSettingsTable>(
      starterSettings,
      ["starter_id", "acknowledgement"],
      ["=", "="],
      [starter.id, "TRUE"]
    );
    const existingConfig = (oldSettings?.multi_motor_config as MultiMotorSettingsConfig | null)
      ?? { v_flt_en: 0, sd_time: 0, motors: [] };

    // Keep only keys the request actually sent, so a diff overlays without wiping the rest.
    const definedOnly = (obj: Record<string, any>) =>
      Object.fromEntries(Object.entries(obj).filter(([, val]) => val !== undefined));

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
      } else {
        mergedMotors.push({ ...identity, ...changed, acknowledgement: "FALSE" });
      }
    }

    const multiMotorConfig: MultiMotorSettingsConfig = {
      v_flt_en: validatedBody.v_flt_en ?? existingConfig.v_flt_en,
      sd_time: validatedBody.sd_time ?? existingConfig.sd_time,
      motors: mergedMotors,
    };

    await db.transaction(async (trx) => {
      await saveSingleRecord<StarterSettingsTable>(
        starterSettings,
        { ...validatedDeviceSettings, starter_id: starter.id, created_by: user.id, multi_motor_config: multiMotorConfig },
        trx
      );
      await ActivityService.writeStarterSettingsUpdatedLog(
        user.id,
        starter.id,
        { multi_motor_config: oldSettings?.multi_motor_config ?? null },
        { multi_motor_config: multiMotorConfig },
        trx,
        starter.pcb_number
      );
    });
  };

  getStarterSettingsLimitsHandler = async (c: Context) => {
    try {
      const starterId = +(c.req.param("starter_id") ?? 0);
      const starterData = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
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
      const userPayload = c.get("user_payload");
      const settingId = +(c.req.param("id") ?? 0);
      const body = await c.req.json();
      const { id, starter_id, created_at, updated_at, ...rest } = body;

      const foundedSettingId = await getRecordById<StarterSettingsLimitsTable>(starterSettingsLimits, settingId);
      if (!foundedSettingId) throw new BadRequestException(SETTINGS_LIMITS_NOT_FOUND);

      const changedOldData: Record<string, any> = {};
      const changedNewData: Record<string, any> = {};
      for (const key of Object.keys(rest)) {
        const oldValue = (foundedSettingId as any)[key];
        const newValue = rest[key];
        if (newValue !== undefined && String(newValue) !== String(oldValue)) {
          changedOldData[key] = oldValue;
          changedNewData[key] = newValue;
        }
      }

      const starterForLimitsLog = foundedSettingId.starter_id
        ? await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [foundedSettingId.starter_id, "ARCHIVED"], ["pcb_number"])
        : null;

      await db.transaction(async (trx) => {
        await updateRecordById<StarterSettingsLimitsTable>(starterSettingsLimits, foundedSettingId.id, rest, trx);
        await ActivityService.writeStarterSettingsUpdatedLog(
          userPayload.id,
          foundedSettingId.starter_id ?? foundedSettingId.id,
          changedOldData,
          changedNewData,
          trx,
          starterForLimitsLog?.pcb_number ?? null
        );
      });
      return sendResponse(c, 200, SETTINGS_LIMITS_UPDATED);
    } catch (error: any) {
      console.error("Error at updateStarterSettingsLimits:", error);
      throw error;
    }
  };

  getStarterAckHistoryHandler = async (c: Context) => {
    try {
      const starterId = +(c.req.param("starter_id") ?? 0);
      const starterData = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      const whereQuery: WhereQueryData<StarterSettingsTable> = {
        columns: ["starter_id"],
        relations: ["="],
        values: [starterData.id],
      };

      const ackHistory = await getRecordsConditionally<StarterSettingsTable>(starterSettings, whereQuery, ["id", "acknowledgement", "time_stamp", "created_at", "updated_at"]);
      return sendResponse(c, 200, SETTINGS_FETCHED, ackHistory);
    } catch (error) {
      console.error("Error at getStarterAckHistory:", error);
      throw error;
    }
  };

  getStarterSettingDetailsMobileHandler = async (c: Context) => {
    try {
      const starterId = +(c.req.param("starter_id") ?? 0);
      const query = c.req.query();
      const starterData = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      const defaultColumns = ["id", "starter_id", "lvf", "hvf", "time_stamp"];
      let columnsToFetch = defaultColumns;

      if (query.columns) {
        const extraColumns = query.columns.split(",");
        columnsToFetch = getTableColumnsWithDefaults(starterSettings, defaultColumns, extraColumns);
      }
      const columnsToFetchObj = columnsToFetch.reduce((obj, column) => { obj[column] = true; return obj }, {} as Record<string, boolean>);
      const response = await getAcknowledgedStarterSettings(starterId, columnsToFetchObj);
      return sendResponse(c, 200, SETTINGS_FETCHED, response);
    } catch (error: any) {
      console.error("Error at get starter setting details in Mobile:", error);
      throw error;
    }
  }


  getStarterSettingsLimitsMobileHandler = async (c: Context) => {
    try {
      const starterId = +(c.req.param("starter_id") ?? 0);
      const query = c.req.query();
      const starterData = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);

      // as_dly_min/max and start_time_min/max are returned alongside the voltage bounds
      // without the caller having to ask for them, since the mobile Start Delay and Start
      // Time fields always need their limits.
      const defaultColumns = ["id", "starter_id", "lvf_min", "lvf_max", "hvf_min", "hvf_max", "as_dly_min", "as_dly_max", "start_time_min", "start_time_max", "created_at"];
      let columnsToFetch = defaultColumns;

      if (query.columns) {
        const extraColumns = query.columns.split(",");
        columnsToFetch = getTableColumnsWithDefaults(starterSettingsLimits, defaultColumns, extraColumns);
      }
      const response = await getSingleRecordByAColumnValue<StarterSettingsLimitsTable>(starterSettingsLimits, "starter_id", "=", [starterId], columnsToFetch);
      return sendResponse(c, 200, SETTINGS_LIMITS_FETCHED, response);
    } catch (error: any) {
      console.error("Error at get starter setting details in Mobile:", error);
      throw error;
    }
  }

  getStarterDefaultSettingsLimitsHandler = async (c: Context) => {
    try {
      const defaultSettingsLimits = await getRecordsConditionally<StarterDefaultSettingsLimitsTable>(
        StarterDefaultSettingsLimits,
        undefined,
        undefined,
      );

      if (!defaultSettingsLimits || defaultSettingsLimits.length === 0) {
        throw new BadRequestException(DEFAULT_SETTINGS_LIMITS_NOT_FOUND);
      }

      return sendResponse(c, 200, DEFAULT_SETTINGS_LIMITS_FETCHED, defaultSettingsLimits[0]);
    } catch (error: any) {
      console.error("Error at get starter default settings limits:", error);
      throw error;
    }
  };

  updateStarterDefaultSettingsLimitsHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const defaultSettingLimitsId = +(c.req.param("id") ?? 0);
      const reqBody = await c.req.json();

      const validatedBody = await validatedRequest<ValidatedUpdateDefaultSettingsLimits>(
        "update-default-settings-limits", reqBody, UPDATE_DEFAULT_SETTINGS_LIMITS_VALIDATION_CRITERIA
      );

      const defaultSettingLimitsData = await getRecordById<StarterDefaultSettingsLimitsTable>(StarterDefaultSettingsLimits, defaultSettingLimitsId);

      if (!defaultSettingLimitsData) {
        throw new BadRequestException(DEFAULT_SETTINGS_LIMITS_NOT_FOUND);
      }

      const { id, created_at, updated_at, ...rest } = defaultSettingLimitsData;

      const changedOldData: Record<string, any> = {};
      const changedNewData: Record<string, any> = {};

      // Track changes
      for (const key of Object.keys(validatedBody)) {
        const oldValue = (rest as any)[key];
        const newValue = (validatedBody as any)[key];

        if (newValue !== undefined && oldValue !== newValue) {
          changedOldData[key] = oldValue;
          changedNewData[key] = newValue;
        }
      }

      const defaultLimitsChangeSummary = Object.keys(changedNewData)
        .map(k => {
          const label = (SETTINGS_FIELD_NAMES as any)[k] ?? k;
          return `'${label}': ${changedOldData[k]} → ${changedNewData[k]}`;
        })
        .join(', ');

      await db.transaction(async (trx) => {
        await updateRecordById<StarterDefaultSettingsLimitsTable>(
          StarterDefaultSettingsLimits,
          defaultSettingLimitsId,
          validatedBody,
          trx
        );

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
    } catch (error: any) {
      console.error("Error at update starter default settings limits:", error);
      handleJsonParseError(error);
      throw error;
    }
  };

  updateLatestSettingAckByStarterHandler = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const starterId = +(c.req.param("starter_id") ?? 0);
      const starterData = await getSingleRecordByMultipleColumnValues<StarterBoxTable>(starterBoxes, ["id", "status"], ["=", "!="], [starterId, "ARCHIVED"], ["id", "pcb_number"]);
      if (!starterData) throw new BadRequestException(DEVICE_NOT_FOUND);
      await db.update(starterSettings).set({ acknowledgement: "TRUE", updated_at: sql`CURRENT_TIMESTAMP` }).where(sql`${starterSettings.id} = (SELECT ${starterSettings.id} FROM ${starterSettings} WHERE ${starterSettings.starter_id} = ${starterId} AND ${starterSettings.acknowledgement} = 'FALSE' ORDER BY ${starterSettings.created_at} DESC LIMIT 1)`);
      await ActivityService.logActivity({
        performedBy: userPayload.id,
        action: "SETTINGS_ACK_UPDATED",
        entityType: "SETTING",
        entityId: starterData.id,
        newData: { acknowledgement: "TRUE", starter_id: starterData.id, pcb_number: starterData.pcb_number },
        message: starterData.pcb_number ? `Settings acknowledged by device '${starterData.pcb_number}'` : "Settings acknowledged by device",
      });
      return sendResponse(c, 200, "Settings updated successfully");
    } catch (error: any) {
      logger.error("Error at updating latest starter setting acknowledgement updated_at:", error);
      console.error("Error at updating latest starter setting acknowledgement updated_at:", error);
      throw error;
    }
  }
}