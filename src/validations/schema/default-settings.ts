import * as v from "valibot";
import { enable01, integerOnly, realOnly, optionalText, phoneNumberArray } from "../../helpers/settings-helpers.js";

export const vUpdateDefaultSettings = v.object({

  /* ================= Device Configuration ================= */
  allflt_en: enable01("allflt_en"),
  flc: realOnly("flc"),
  as_dly: integerOnly("as_dly"),
  pr_flt_en: integerOnly("pr_flt_en"),

  /* ================= Star-delta timings =================
     Nullish, unlike the fields around them: they were added after the screens that post
     to this schema, so a payload without them (or with explicit nulls) must still pass.
     Device payload mapping: start_time -> sd_time, step_delay -> step_dly,
     transfer_time -> tf_time. */
  step_delay: v.nullish(integerOnly("step_delay")),
  start_time: v.nullish(integerOnly("start_time")),
  transfer_time: v.nullish(integerOnly("transfer_time")),
  tpf: realOnly("tpf"),

  /* ================= Enables ================= */
  v_en: enable01("v_en"),
  c_en: enable01("c_en"),

  /* ================= Fault Thresholds ================= */
  ipf: realOnly("ipf"),
  lvf: realOnly("lvf"),
  hvf: realOnly("hvf"),
  vif: realOnly("vif"),
  paminf: realOnly("paminf"),
  pamaxf: realOnly("pamaxf"),
  f_dr: realOnly("f_dr"),
  f_ol: realOnly("f_ol"),
  f_lr: realOnly("f_lr"),
  f_opf: realOnly("f_opf"),
  f_ci: realOnly("f_ci"),

  /* ================= Alert Thresholds ================= */
  pfa: realOnly("pfa"),
  lva: realOnly("lva"),
  hva: realOnly("hva"),
  via: realOnly("via"),
  pamina: realOnly("pamina"),
  pamaxa: realOnly("pamaxa"),
  dr: realOnly("dr"),
  ol: realOnly("ol"),
  lr: realOnly("lr"),
  ci: realOnly("ci"),

  /* ================= Recovery Settings ================= */
  lvr: realOnly("lvr"),
  hvr: realOnly("hvr"),
  olf: realOnly("olf"),
  lrf: realOnly("lrf"),
  opf: realOnly("opf"),
  cif: realOnly("cif"),

  drf: realOnly("drf"),      // Dry Run Recovery for Motor
  lrr: realOnly("lrr"),      // Inrush Current Recovery for Motor
  olr: realOnly("olr"),      // Over Load Recovery Time for Motor
  cir: realOnly("cir"),

  vflt_under_voltage: enable01("vflt_under_voltage"),
  vflt_over_voltage: enable01("vflt_over_voltage"),
  vflt_voltage_imbalance: enable01("vflt_voltage_imbalance"),
  vflt_phase_failure: enable01("vflt_phase_failure"),
  cflt_dry_run: enable01("cflt_dry_run"),
  cflt_over_current: enable01("cflt_over_current"),
  cflt_output_phase_fail: enable01("cflt_output_phase_fail"),
  cflt_curr_imbalance: enable01("cflt_curr_imbalance"),


  /* ================= ATMEL Calibrations ================= */
  ug_r: integerOnly("ug_r"),
  ug_y: integerOnly("ug_y"),
  ug_b: integerOnly("ug_b"),
  ip_r: integerOnly("ip_r"),
  ip_y: integerOnly("ip_y"),
  ip_b: integerOnly("ip_b"),

  /* ================= ADC Calibrations ================= */
  vg_r: realOnly("vg_r", { decimalPlaces: 5 }),
  vg_y: realOnly("vg_y", { decimalPlaces: 5 }),
  vg_b: realOnly("vg_b", { decimalPlaces: 5 }),
  vo_r: realOnly("vo_r"),
  vo_y: realOnly("vo_y"),
  vo_b: realOnly("vo_b"),
  ig_r: realOnly("ig_r", { decimalPlaces: 5 }),
  ig_y: realOnly("ig_y", { decimalPlaces: 5 }),
  ig_b: realOnly("ig_b", { decimalPlaces: 5 }),
  io_r: realOnly("io_r"),
  io_y: realOnly("io_y"),
  io_b: realOnly("io_b"),

  /* ================= PT100 / PT1000 Calibrations ================= */
  r1: integerOnly("r1"),
  r2: integerOnly("r2"),
  off: integerOnly("off"),
  limit: realOnly("limit"),

  /* ================= MQTT Configuration ================= */
  ca_fn: optionalText("ca_fn"),
  bkr_adrs: optionalText("bkr_adrs"),
  usrn: optionalText("usrn"),
  pswd: optionalText("pswd"),
  prd_url: optionalText("prd_url"),
  port: integerOnly("port"),
  crt_en: integerOnly("crt_en"),

  /* ================= IVRS Configuration ================= */
  sms_pswd: optionalText("sms_pswd"),
  c_lang: integerOnly("c_lang"),
  auth_num: phoneNumberArray("auth_num"), // Optional array with phone number validation

  /* ================= Frequency Configuration ================= */
  dft_liv_f: integerOnly("dft_liv_f"),
  h_liv_f: integerOnly("h_liv_f"),
  m_liv_f: integerOnly("m_liv_f"),
  l_liv_f: integerOnly("l_liv_f"),
  pwr_info_f: integerOnly("pwr_info_f"),

  /* ================= Feature Enables ================= */
  ivrs_en: enable01("ivrs_en"),
  sms_en: enable01("sms_en"),
  rmt_en: enable01("rmt_en"),
});

export type ValidatedUpdateDefaultSettings = v.InferOutput<typeof vUpdateDefaultSettings>;

/**
 * Global default starter type for PATCH /settings/default/:id, e.g. { "motor_starter_type": "CONTACTOR" }.
 *
 * Deliberately NOT a field on vUpdateDefaultSettings: that schema's output is spread
 * straight into starter_settings inserts (insertStarterSettingHandler and
 * insertMultiMotorStarterSetting), and starter_settings has no motor_starter_type column,
 * so putting it there would push an unknown column into those writes.
 *
 * Nullish rather than optional because the screen loads the record with GET and posts the
 * whole thing back — an unset value arrives as an explicit null, which v.optional rejects.
 */
export const vDefaultSettingsStarterType = v.object({
  motor_starter_type: v.nullish(
    v.picklist(["STAR_RELAY", "CONTACTOR", "STAR_DELTA"], "Invalid motor starter type")
  ),
});

export type ValidatedDefaultSettingsStarterType = v.InferOutput<typeof vDefaultSettingsStarterType>;
