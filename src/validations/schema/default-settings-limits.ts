import * as v from "valibot";

/**
 * Validation helper for real numbers with non-negative check
 */
const realNonNegative = (fieldName: string) =>
  v.pipe(
    v.number(`${fieldName} must be a number`),
    v.minValue(0, `${fieldName} cannot be negative`)
  );

/**
 * Validation helper for integers with non-negative check
 */
const integerNonNegative = (fieldName: string) =>
  v.pipe(
    v.number(`${fieldName} must be an integer`),
    v.integer(`${fieldName} must be an integer`),
    v.minValue(0, `${fieldName} cannot be negative`)
  );

export const vUpdateDefaultSettingsLimits = v.partial(v.object({
  // ================= Device Configurations – Settings =================
  pr_flt_en_min: integerNonNegative("Pre-fault enable minimum"),
  pr_flt_en_max: integerNonNegative("Pre-fault enable maximum"),

  flc_min: realNonNegative("Full load current minimum"),
  flc_max: realNonNegative("Full load current maximum"),

  as_dly_min: integerNonNegative("Auto start delay minimum"),
  as_dly_max: integerNonNegative("Auto start delay maximum"),

  tpf_min: realNonNegative("Time per fault minimum"),
  tpf_max: realNonNegative("Time per fault maximum"),

  // Enables
  v_en: integerNonNegative("Voltage enable"),
  c_en: integerNonNegative("Current enable"),

  // ================= Fault Thresholds =================
  ipf_min: realNonNegative("Input phase failure fault min"),
  ipf_max: realNonNegative("Input phase failure fault max"),

  lvf_min: realNonNegative("Low voltage fault min"),
  lvf_max: realNonNegative("Low voltage fault max"),

  hvf_min: realNonNegative("High voltage fault min"),
  hvf_max: realNonNegative("High voltage fault max"),

  vif_min: realNonNegative("Voltage imbalance fault min"),
  vif_max: realNonNegative("Voltage imbalance fault max"),

  paminf_min: realNonNegative("Phase angle min fault min"),
  paminf_max: realNonNegative("Phase angle min fault max"),

  pamaxf_min: realNonNegative("Phase angle max fault min"),
  pamaxf_max: realNonNegative("Phase angle max fault max"),

  f_dr_min: realNonNegative("Dry run fault min"),
  f_dr_max: realNonNegative("Dry run fault max"),

  f_ol_min: realNonNegative("Overload fault min"),
  f_ol_max: realNonNegative("Overload fault max"),

  f_lr_min: realNonNegative("Locked rotor fault min"),
  f_lr_max: realNonNegative("Locked rotor fault max"),

  f_opf: realNonNegative("Output phase failure fault"),
  f_ci_min: realNonNegative("Current imbalance fault min"),
  f_ci_max: realNonNegative("Current imbalance fault max"),

  // ================= Alert Thresholds =================
  pfa_min: realNonNegative("Phase failure alert min"),
  pfa_max: realNonNegative("Phase failure alert max"),

  lva_min: realNonNegative("Low voltage alert min"),
  lva_max: realNonNegative("Low voltage alert max"),

  hva_min: realNonNegative("High voltage alert min"),
  hva_max: realNonNegative("High voltage alert max"),

  via_min: realNonNegative("Voltage imbalance alert min"),
  via_max: realNonNegative("Voltage imbalance alert max"),

  pamina_min: realNonNegative("Phase angle min alert min"),
  pamina_max: realNonNegative("Phase angle min alert max"),

  pamaxa_min: realNonNegative("Phase angle max alert min"),
  pamaxa_max: realNonNegative("Phase angle max alert max"),

  dr_min: realNonNegative("Dry run alert min"),
  dr_max: realNonNegative("Dry run alert max"),

  ol_min: realNonNegative("Overload alert min"),
  ol_max: realNonNegative("Overload alert max"),

  lr_min: realNonNegative("Locked rotor alert min"),
  lr_max: realNonNegative("Locked rotor alert max"),

  ci_min: realNonNegative("Current imbalance alert min"),
  ci_max: realNonNegative("Current imbalance alert max"),

  // ================= Recovery Settings =================
  lvr_min: realNonNegative("Low voltage recovery min"),
  lvr_max: realNonNegative("Low voltage recovery max"),

  hvr_min: realNonNegative("High voltage recovery min"),
  hvr_max: realNonNegative("High voltage recovery max"),

  olf_min: realNonNegative("Overload recovery factor min"),
  olf_max: realNonNegative("Overload recovery factor max"),

  lrf_min: realNonNegative("Locked rotor recovery factor min"),
  lrf_max: realNonNegative("Locked rotor recovery factor max"),

  opf_min: realNonNegative("Output phase failure recovery min"),
  opf_max: realNonNegative("Output phase failure recovery max"),

  cif_min: realNonNegative("Current imbalance recovery factor min"),
  cif_max: realNonNegative("Current imbalance recovery factor max"),

  drf_min: realNonNegative("Dry run recovery min"),
  drf_max: realNonNegative("Dry run recovery max"),

  lrr_min: realNonNegative("Inrush current recovery min"),
  lrr_max: realNonNegative("Inrush current recovery max"),

  olr_min: realNonNegative("Overload recovery time min"),
  olr_max: realNonNegative("Overload recovery time max"),

  cir_min: realNonNegative("Current imbalance recovery time min"),
  cir_max: realNonNegative("Current imbalance recovery time max"),

  // ================= ATMEL Calibrations =================
  ug_r_min: realNonNegative("Voltage gain R min"),
  ug_r_max: realNonNegative("Voltage gain R max"),
  ug_y_min: realNonNegative("Voltage gain Y min"),
  ug_y_max: realNonNegative("Voltage gain Y max"),
  ug_b_min: realNonNegative("Voltage gain B min"),
  ug_b_max: realNonNegative("Voltage gain B max"),

  ip_r_min: realNonNegative("Current gain R min"),
  ip_r_max: realNonNegative("Current gain R max"),
  ip_y_min: realNonNegative("Current gain Y min"),
  ip_y_max: realNonNegative("Current gain Y max"),
  ip_b_min: realNonNegative("Current gain B min"),
  ip_b_max: realNonNegative("Current gain B max"),

  // ================= ADC Calibrations =================
  vg_r_min: realNonNegative("Voltage gain R (ADC) min"),
  vg_r_max: realNonNegative("Voltage gain R (ADC) max"),
  vg_y_min: realNonNegative("Voltage gain Y (ADC) min"),
  vg_y_max: realNonNegative("Voltage gain Y (ADC) max"),
  vg_b_min: realNonNegative("Voltage gain B (ADC) min"),
  vg_b_max: realNonNegative("Voltage gain B (ADC) max"),

  vo_r_min: realNonNegative("Voltage offset R (ADC) min"),
  vo_r_max: realNonNegative("Voltage offset R (ADC) max"),
  vo_y_min: realNonNegative("Voltage offset Y (ADC) min"),
  vo_y_max: realNonNegative("Voltage offset Y (ADC) max"),
  vo_b_min: realNonNegative("Voltage offset B (ADC) min"),
  vo_b_max: realNonNegative("Voltage offset B (ADC) max"),

  ig_r_min: realNonNegative("Current gain R (ADC) min"),
  ig_r_max: realNonNegative("Current gain R (ADC) max"),
  ig_y_min: realNonNegative("Current gain Y (ADC) min"),
  ig_y_max: realNonNegative("Current gain Y (ADC) max"),
  ig_b_min: realNonNegative("Current gain B (ADC) min"),
  ig_b_max: realNonNegative("Current gain B (ADC) max"),

  io_r_min: realNonNegative("Current offset R (ADC) min"),
  io_r_max: realNonNegative("Current offset R (ADC) max"),
  io_y_min: realNonNegative("Current offset Y (ADC) min"),
  io_y_max: realNonNegative("Current offset Y (ADC) max"),
  io_b_min: realNonNegative("Current offset B (ADC) min"),
  io_b_max: realNonNegative("Current offset B (ADC) max"),

  // ================= PT100/PT1000 Calibrations =================
  r1: integerNonNegative("RTD resistance R1"),
  r2: integerNonNegative("RTD resistance R2"),
  off: integerNonNegative("RTD temperature offset"),

  // ================= MQTT Configuration =================
  ca_fn: v.nullish(v.optional(v.string("CA filename must be string"))),
  bkr_adrs: v.nullish(v.optional(v.string("Broker address must be string"))),
  sn: v.nullish(v.optional(v.string("Serial number must be string"))),
  usrn: v.nullish(v.optional(v.string("Username must be string"))),
  pswd: v.nullish(v.optional(v.string("Password must be string"))),
  prd_url: v.nullish(v.optional(v.string("Prod URL must be string"))),
  port: integerNonNegative("MQTT port"),
  crt_en: integerNonNegative("Certificate enable"),

  // ================= IVRS Configuration =================
  sms_pswd: v.nullish(v.optional(v.string("SMS password must be string"))),
  c_lang: integerNonNegative("Communication language"),
  auth_num: v.nullish(v.optional(v.array(v.string("Authorized number must be string")))),

  // ================= Frequency Configuration =================
  dft_liv_f: integerNonNegative("Default live frequency"),
  h_liv_f: integerNonNegative("High priority frequency"),
  m_liv_f: integerNonNegative("Medium priority frequency"),
  l_liv_f: integerNonNegative("Low priority frequency"),
  pwr_info_f: integerNonNegative("Power info frequency"),

  // ================= Feature Enables =================
  ivrs_en: integerNonNegative("IVRS enable"),
  sms_en: integerNonNegative("SMS enable"),
  rmt_en: integerNonNegative("Remote enable"),
}));

export type ValidatedUpdateDefaultSettingsLimits = v.InferOutput<typeof vUpdateDefaultSettingsLimits>;
