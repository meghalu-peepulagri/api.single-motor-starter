import * as v from "valibot";
import { enable01, integerOnly, realOnly, requiredText, phoneNumberArray } from "../../helpers/settings-helpers.js";

export const vUpdateDefaultSettings = v.object({

  /* ================= Device Configuration ================= */
  allflt_en: enable01("allflt_en"),
  flc: realOnly("flc"),
  as_dly: integerOnly("as_dly"),
  pr_flt_en: integerOnly("pr_flt_en"),
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
  vg_r: realOnly("vg_r"),
  vg_y: realOnly("vg_y"),
  vg_b: realOnly("vg_b"),
  vo_r: realOnly("vo_r"),
  vo_y: realOnly("vo_y"),
  vo_b: realOnly("vo_b"),
  ig_r: realOnly("ig_r"),
  ig_y: realOnly("ig_y"),
  ig_b: realOnly("ig_b"),
  io_r: realOnly("io_r"),
  io_y: realOnly("io_y"),
  io_b: realOnly("io_b"),

  /* ================= PT100 / PT1000 Calibrations ================= */
  r1: integerOnly("r1"),
  r2: integerOnly("r2"),
  off: integerOnly("off"),
  limit: realOnly("limit"),

  /* ================= MQTT Configuration ================= */
  ca_fn: requiredText("ca_fn"),
  bkr_adrs: requiredText("bkr_adrs"),
  usrn: requiredText("usrn"),
  pswd: requiredText("pswd"),
  prd_url: requiredText("prd_url"),
  port: integerOnly("port"),
  crt_en: integerOnly("crt_en"),

  /* ================= IVRS Configuration ================= */
  sms_pswd: requiredText("sms_pswd"),
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
