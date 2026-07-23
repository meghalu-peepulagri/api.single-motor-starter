import type { StarterSettings } from "../database/schemas/starter-settings.js";
import { motorKey } from "./motor-control-payload-helper.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { REQUEST_TYPES } from "./packet-types-helper.js";

export type MultiMotorSettingsPayload = {
  T: typeof REQUEST_TYPES.CALIBRATION;
  S: number;
  D: {
    dvc_c: Record<string, any>;
  };
};

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
export function buildMultiMotorSettingsPayload(
  settings: StarterSettings,
  motorIndexByMotorId: Map<number, number>,
): MultiMotorSettingsPayload {
  const config = settings.multi_motor_config;

  const dvc_c: Record<string, any> = {
    allflt_en: settings.allflt_en,
    as_dly: settings.as_dly,
    ipf: settings.ipf,
    lvf: settings.lvf,
    hvf: settings.hvf,
    vif: settings.vif,
    v_flt_en: config?.v_flt_en,
    sd_time: config?.sd_time,
  };

  for (const motor of config?.motors ?? []) {
    const index = motorIndexByMotorId.get(motor.motor_id);
    if (index === undefined) continue;

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
  }

  return {
    T: REQUEST_TYPES.CALIBRATION,
    S: randomSequenceNumber(),
    D: { dvc_c },
  };
}
