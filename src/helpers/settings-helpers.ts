import * as v from "valibot";
import { SETTINGS_FIELD_NAMES } from "../constants/app-constants.js";
import type { StarterBox } from "../database/schemas/starter-boxes.js";
import { publishUpdatedStarterSettings, waitForAck } from "../services/db/mqtt-db-services.js";
import { logger } from "../utils/logger.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { ACK_TYPES } from "./packet-types-helper.js";


// Integer only helper
export const integerOnly = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`),
    v.check(
      (val) => Number.isInteger(val),
      `${SETTINGS_FIELD_NAMES[field]} expects an integer but received a decimal`
    )
  );

// Real (number) helper
export const realOnly = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`),
    v.check(
      (val) => typeof val === "number",
      `${SETTINGS_FIELD_NAMES[field]} expects a real number`
    )
  );

// 0/1 helper
export const enable01 = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.number(`${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`),
    v.check(
      (val: number) => val === 0 || val === 1,
      `${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`
    )
  );
// Required text helper
export const requiredText = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.string(`${SETTINGS_FIELD_NAMES[field]} is required`);


export const prepareStmAtmelSettingsData = (starter: StarterBox, settings: any) => {
  if (!starter?.pcb_number || !starter?.mac_address || !settings) return null;

  return {
    T: 13,
    S: randomSequenceNumber(),

    D: {
      /* ================= Device Config ================= */
      dvc_c: {
        /* ================= Basic ================= */
        allflt_en: settings.allflt_en,
        flc: settings.flc,
        as_dly: settings.st,

        /* ================= Enables ================= */
        v_en: settings.v_en,
        c_en: settings.c_en,

        /* ================= Fault Thresholds ================= */
        ipf: settings.ipf,
        lvf: settings.lvf,
        hvf: settings.hvf,
        vif: settings.vif,
        paminf: settings.paminf,
        pamaxf: settings.pamaxf,

        f_dr: settings.f_dr,
        f_ol: settings.f_ol,
        f_lr: settings.f_lr,
        f_opf: settings.f_opf,
        f_ci: settings.f_ci,

        /* ================= Alert Thresholds ================= */
        pfa: settings.pfa,
        lva: settings.lva,
        hva: settings.hva,
        via: settings.via,
        pamina: settings.pamina,
        pamaxa: settings.pamaxa,

        dr: settings.dr,
        ol: settings.ol,
        lr: settings.lr,
        ci: settings.ci,

        /* ================= Recovery Settings ================= */
        lvr: settings.lvr,
        hvr: settings.hvr,
        olf: settings.olf,
        lrf: settings.lrf,
        opf: settings.opf,
        cif: settings.cif,
      },
      /* ================= Calibrations ================= */
      clb: {
        ug_r: settings.ug_r,
        ug_y: settings.ug_y,
        ug_b: settings.ug_b,
        ig_r: settings.ig_r,
        ig_y: settings.ig_y,
        ig_b: settings.ig_b,
      },

      /* ================= MQTT Configuration ================= */
      mqt_c: {
        ca_fn: settings.ca_fn,
        bkr_adrs: settings.bkr_adrs,
        usrn: settings.usrn,
        pswd: settings.pswd,
        prd_url: settings.prd_url,
        port: settings.port,
        crt_en: settings.crt_en,
      },

      /* ================= IVRS Configuration ================= */
      ivrs_info: {
        sms_pswd: settings.sms_pswd,
        c_lang: settings.c_lang,
        auth_num: settings.auth_num ?? [],
      },

      /* ================= Frequency Configuration ================= */
      fq_c: {
        dft_liv_f: settings.dft_liv_f,
        h_liv_f: settings.h_liv_f,
        m_liv_f: settings.m_liv_f,
        l_liv_f: settings.l_liv_f,
        pwr_info_f: settings.pwr_info_f,
      },

      /* ================= Feature Enables ================= */
      f_e: {
        ivrs_en: settings.ivrs_en,
        sms_en: settings.sms_en,
        rmt_en: settings.rmt_en,
      },
    },
  };
}

export const prepareHardWareVersion = (starterDetails: StarterBox) => {
  if (!starterDetails.hardware_version) return;
  return {
    "T": 17,
    "S": randomSequenceNumber(),
    "D": {
      "sn": starterDetails.pcb_number,
      "hw": starterDetails.hardware_version,
    }
  };
};


const validateSettingsAck = (payload: any, expectedSequence: number) => {
  return (
    payload &&
    payload.T === ACK_TYPES.ADMIN_CONFIG_DATA_REQUEST_ACK &&
    payload.S === expectedSequence &&
    (payload.D === 0 || payload.D === 1)
  );
};

export const publishMultipleTimesInBackground = async (
  devicePayload: any,
  starterDetails: StarterBox
): Promise<void> => {
  const totalAttempts = 3;
  const ackWaitTimes = [3000, 5000, 5000];

  const isAckValid = (payload: any) =>
    validateSettingsAck(payload, devicePayload.S);

  const ackIdentifiers = [
    starterDetails.pcb_number,
    starterDetails.mac_address, // <-- support MAC ACK also
  ].filter(Boolean);

  for (let i = 0; i < totalAttempts; i++) {
    try {
      publishUpdatedStarterSettings(devicePayload, starterDetails);

      const ackReceived = await waitForAck(
        ackIdentifiers,
        ackWaitTimes[i],
        isAckValid
      );

      if (ackReceived) {
        return; // stop retries on ACK
      }

    } catch (error) {
      logger.error(
        `Attempt ${i + 1} failed for starter ${starterDetails.id}`,
        error
      );
    }
  }

  logger.error(
    `[Failure] All ${totalAttempts} retry attempts failed for starter id : ${starterDetails.id}. pcb : ${starterDetails.pcb_number}, mac : ${starterDetails.mac_address}`
  );
};
