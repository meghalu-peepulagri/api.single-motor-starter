import { motorKey } from "./motor-control-payload-helper.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { REQUEST_TYPES } from "./packet-types-helper.js";
/**
 * Builds the nested T:4 multi-motor settings payload for MULTI_STARTER boxes —
 * the single-motor equivalent (prepareDeviceConfigurationPayload in
 * heart-beat-prepared-payload-helper.ts) is untouched and still used for
 * SINGLE_STARTER boxes.
 *
 * Voltage-based fields (measured once per box) come straight off the existing
 * flat starter_settings columns, same as the single-motor payload. Current-based
 * fields (measured per motor branch) come from settings.multi_motor_config.motors[],
 * keyed into m<N>/m<N>_clb blocks via motorKey() — the same m<N> convention T:1/T:2
 * control/mode already use. motorIndexByMotorId maps each config motor_id to its
 * live motor_index; a motor_id with no current match (e.g. motor since reassigned)
 * is silently skipped rather than sent with a stale index.
 */
export function buildMultiMotorSettingsPayload(settings, motorIndexByMotorId) {
    const config = settings.multi_motor_config;
    const dvc_c = {
        allflt_en: settings.allflt_en,
        as_dly: settings.as_dly,
        ipf: settings.ipf,
        lvf: settings.lvf,
        hvf: settings.hvf,
        vif: settings.vif,
        v_flt_en: config?.v_flt_en,
        sd_time: config?.sd_time,
    };
    const clb = {
        volt: {
            vg_r: settings.vg_r,
            vg_y: settings.vg_y,
            vg_b: settings.vg_b,
            vo_r: settings.vo_r,
            vo_y: settings.vo_y,
            vo_b: settings.vo_b,
        },
    };
    for (const motor of config?.motors ?? []) {
        const index = motorIndexByMotorId.get(motor.motor_id);
        if (index === undefined)
            continue;
        const key = motorKey(index);
        dvc_c[key] = {
            flt_en: motor.flt_en,
            flc: motor.flc,
            f_dr: motor.f_dr,
            f_ol: motor.f_ol,
            f_lr: motor.f_lr,
            f_opf: motor.f_opf,
            f_ci: motor.f_ci,
            dr: motor.dr,
            ol: motor.ol,
            lr: motor.lr,
            ci: motor.ci,
            drf: motor.drf,
            olf: motor.olf,
            lrf: motor.lrf,
            opf: motor.opf,
            cif: motor.cif,
            olr: motor.olr,
            lrr: motor.lrr,
            cir: motor.cir,
        };
        clb[`${key}_clb`] = {
            ig_r: motor.ig_r,
            ig_y: motor.ig_y,
            ig_b: motor.ig_b,
            io_r: motor.io_r,
            io_y: motor.io_y,
            io_b: motor.io_b,
        };
    }
    const mqt_c = {
        ca_fn: settings.ca_fn,
        bkr_adrs: settings.bkr_adrs,
        sn: settings.sn,
        usrn: settings.usrn,
        pswd: settings.pswd,
        prd_url: settings.prd_url,
        port: settings.port,
        crt_en: settings.crt_en,
    };
    const fq_c = {
        dft_liv_f: settings.dft_liv_f,
        h_liv_f: settings.h_liv_f,
        m_liv_f: settings.m_liv_f,
        l_liv_f: settings.l_liv_f,
        pwr_info_f: settings.pwr_info_f,
    };
    return {
        T: REQUEST_TYPES.CALIBRATION,
        S: randomSequenceNumber(),
        D: { dvc_c, clb, mqt_c, fq_c },
    };
}
