import { motorKey } from "./motor-control-payload-helper.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { REQUEST_TYPES } from "./packet-types-helper.js";
/**
 * Builds the nested T:4 multi-motor settings payload for MULTI_STARTER boxes —
 * the single-motor equivalent (prepareDeviceConfigurationPayload in
 * heart-beat-prepared-payload-helper.ts) is untouched and still used for
 * SINGLE_STARTER boxes.
 *
 * Only the dvc_c block is published for multi-motor — clb (voltage/current
 * calibration), mqt_c (MQTT config) and fq_c (live-data frequency) are intentionally
 * omitted. Box-level device fields come straight off the flat starter_settings
 * columns; per-motor fault fields come from settings.multi_motor_config.motors[],
 * keyed into m<N> blocks via motorKey() — the same m<N> convention T:1/T:2
 * control/mode already use. motorIndexByMotorId maps each config motor_id to its
 * live motor_index; a motor_id with no current match (e.g. motor since reassigned)
 * is silently skipped rather than sent with a stale index.
 */
export function buildMultiMotorSettingsPayload(settings, motorIndexByMotorId, options = {}) {
    const config = settings.multi_motor_config;
    const dvc_c = {
        allflt_en: settings.allflt_en,
        as_dly: settings.as_dly,
        ipf: settings.ipf,
        lvf: settings.lvf,
        hvf: settings.hvf,
        vif: settings.vif,
        v_flt_en: config?.v_flt_en,
        // Dual boxes keep reading sd_time from the JSON block so their payload stays
        // byte-identical to what they get today. A single-motor box has no block, so it
        // falls back to the flat star-delta column.
        sd_time: options.singleMotor ? (config?.sd_time ?? settings.start_time) : config?.sd_time,
    };
    for (const block of motorBlocksFor(settings, motorIndexByMotorId, options.singleMotor === true)) {
        dvc_c[motorKey(block.index)] = block.values;
    }
    return {
        T: REQUEST_TYPES.CALIBRATION,
        S: randomSequenceNumber(),
        D: { dvc_c },
    };
}
/**
 * The nineteen per-motor keys, picked identically from either source so the block a
 * device sees is the same shape whichever fed it. `source` is a multi_motor_config
 * motor entry for a dual box, or the flat starter_settings row for a single-motor one.
 */
function perMotorFields(source) {
    return {
        flt_en: source.flt_en,
        flc: source.flc,
        f_dr: source.f_dr,
        f_ol: source.f_ol,
        f_lr: source.f_lr,
        f_opf: source.f_opf,
        f_ci: source.f_ci,
        dr: source.dr,
        ol: source.ol,
        lr: source.lr,
        ci: source.ci,
        drf: source.drf,
        olf: source.olf,
        lrf: source.lrf,
        opf: source.opf,
        cif: source.cif,
        olr: source.olr,
        lrr: source.lrr,
        cir: source.cir,
    };
}
/**
 * Dual boxes take their blocks from multi_motor_config.motors[], keyed to the live
 * motor_index. A single-motor V2.0 box has no such block — its motor settings live in
 * the flat starter_settings columns — so those are PROJECTED into slot 1 at publish
 * time. Projection rather than migration: the flat columns stay the single source of
 * truth, so switching the box back to 1.0 is lossless and the save path never needs to
 * know which version the box is on.
 */
function motorBlocksFor(settings, motorIndexByMotorId, singleMotor) {
    if (singleMotor) {
        return [{ index: 1, values: perMotorFields(settings) }];
    }
    const blocks = [];
    for (const motor of settings.multi_motor_config?.motors ?? []) {
        const index = motorIndexByMotorId.get(motor.motor_id);
        // A motor_id with no current match (e.g. motor since reassigned) is skipped rather
        // than sent with a stale index.
        if (index === undefined)
            continue;
        blocks.push({ index, values: perMotorFields(motor) });
    }
    return blocks;
}
