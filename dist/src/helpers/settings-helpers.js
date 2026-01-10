import * as v from "valibot";
import { SETTINGS_FIELD_NAMES } from "../constants/app-constants.js";
import { publishStarterSettings, waitForAck } from "../services/db/mqtt-db-services.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
// Integer only helper
export const integerOnly = (field) => v.pipe(v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`), v.check((val) => Number.isInteger(val), `${SETTINGS_FIELD_NAMES[field]} expects an integer but received a decimal`));
// Real (number) helper
export const realOnly = (field) => v.pipe(v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`), v.check((val) => typeof val === "number", `${SETTINGS_FIELD_NAMES[field]} expects a real number`));
// 0/1 helper
export const enable01 = (field) => v.pipe(v.number(`${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`), v.check((val) => val === 0 || val === 1, `${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`));
// Required text helper
export const requiredText = (field) => v.string(`${SETTINGS_FIELD_NAMES[field]} is required`);
export const prepareSettingsData = (starter, settings) => {
    if (!starter?.pcb_number || !settings)
        return null;
    return {
        T: 13,
        S: randomSequenceNumber(),
        D: {
            /* ================= dvc_cnfg ================= */
            dvc_cnfg: {
                flt_en: settings.dvc_flt_en,
                flc: settings.dvc_flc,
                st: settings.dvc_st,
                flt: {
                    ipf: settings.dvc_flt_ipf,
                    lvf: settings.dvc_flt_lvf,
                    hvf: settings.dvc_flt_hvf,
                    vif: settings.dvc_flt_vif,
                    paminf: settings.dvc_flt_paminf,
                    pamaxf: settings.dvc_flt_pamaxf,
                },
                alt: {
                    pfa: settings.dvc_alt_pfa,
                    lva: settings.dvc_alt_lva,
                    hva: settings.dvc_alt_hva,
                    via: settings.dvc_alt_via,
                    pamina: settings.dvc_alt_pamina,
                    pamaxa: settings.dvc_alt_pamaxa,
                },
                rec: {
                    lvr: settings.dvc_rec_lvr,
                    hvr: settings.dvc_rec_hvr,
                },
            },
            /* ================= mtr_cnfg ================= */
            mtr_cnfg: {
                flt: {
                    dr: settings.mtr_flt_dr,
                    ol: settings.mtr_flt_ol,
                    lr: settings.mtr_flt_lr,
                    opf: settings.mtr_flt_opf,
                    ci: settings.mtr_flt_ci,
                },
                alt: {
                    dr: settings.mtr_alt_dr,
                    ol: settings.mtr_alt_ol,
                    lr: settings.mtr_alt_lr,
                    ci: settings.mtr_alt_ci,
                },
                rec: {
                    ol: settings.mtr_rec_ol,
                    lr: settings.mtr_rec_lr,
                    ci: settings.mtr_rec_ci,
                },
            },
            /* ================= atml_cnfg ================= */
            atml_cnfg: {
                sn: starter.pcb_number,
                ug_r: settings.atml_ug_r,
                ug_y: settings.atml_ug_y,
                ug_b: settings.atml_ug_b,
                ig_r: settings.atml_ig_r,
                ig_y: settings.atml_ig_y,
                ig_b: settings.atml_ig_b,
            },
            /* ================= mqt_cnfg ================= */
            mqt_cnfg: {
                ca_fn: settings.mqt_ca_fn,
                bkr_adrs: settings.mqt_bkr_adrs,
                c_id: settings.mqt_c_id,
                emqx_usrn: settings.mqt_emqx_usrn,
                emqx_pswd: settings.mqt_emqx_pswd,
                prod_http: settings.mqt_prod_http,
                bkp_http: settings.mqt_bkp_http,
                bkr_port: settings.mqt_bkr_port,
                ce_len: settings.mqt_ce_len,
            },
            /* ================= ivrs_info ================= */
            ivrs_info: {
                sms_pswd: settings.ivrs_sms_pswd,
                c_lang: settings.ivrs_c_lang,
                auth_num: settings.ivrs_auth_num ?? [],
            },
            /* ================= frq_cnfg ================= */
            frq_cnfg: {
                dft_liv_f: settings.frq_dft_liv_f,
                h_liv_f: settings.frq_h_liv_f,
                m_liv_f: settings.frq_m_liv_f,
                l_liv_f: settings.frq_l_liv_f,
                pwr_info_f: settings.frq_pwr_info_f,
            },
            /* ================= feats_en ================= */
            feats_en: {
                ivrs_en: settings.feats_ivrs_en,
                sms_en: settings.feats_sms_en,
                rmt_en: settings.feats_rmt_en,
            },
            /* ================= flt_en ================= */
            flt_en: {
                ipf: settings.flt_en_ipf,
                lvf: settings.flt_en_lvf,
                hvf: settings.flt_en_hvf,
                vif: settings.flt_en_vif,
                dr: settings.flt_en_dr,
                ol: settings.flt_en_ol,
                lr: settings.flt_en_lr,
                opf: settings.flt_en_opf,
                ci: settings.flt_en_ci,
            },
        },
    };
};
import { ACK_TYPES } from "./packet-types-helper.js";
const validateSettingsAck = (payload, expectedSequence) => {
    return (payload &&
        payload.T === ACK_TYPES.ADMIN_CONFIG_DATA_REQUEST_ACK &&
        payload.S === expectedSequence &&
        (payload.D === 0 || payload.D === 1));
};
export const publishMultipleTimesInBackground = async (devicePayload, pcbNumber, starterId) => {
    const totalAttempts = 3;
    const ackWaitTimes = [3000, 5000, 5000];
    const isAckValid = (payload) => validateSettingsAck(payload, devicePayload.S);
    for (let i = 0; i < totalAttempts; i++) {
        try {
            publishStarterSettings(devicePayload, pcbNumber);
            const ackReceived = await waitForAck(pcbNumber, ackWaitTimes[i], isAckValid);
            if (ackReceived) {
                return; // stop retries on ACK
            }
        }
        catch (error) {
            console.error(`Attempt ${i + 1} failed for starter ${starterId}:`, error);
        }
    }
    console.error(`[Failure] All ${totalAttempts} retry attempts failed for starter ${starterId}.`);
};
