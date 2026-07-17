// Shared shape for the per-motor fields the multi-motor settings JSON payload
// carries — current is measured per motor branch, so these fields (unlike the
// existing flat starter_settings columns) vary per motor rather than per box.
export interface MotorSettingsBlock {
  motor_id: number;
  motor_index?: number;        // 1 = M1, 2 = M2 — lets the frontend map each block to a motor
  motor_reference?: string | null;
  // Per-motor fields are optional — the grouped device payload (dvc_c.mN) sends only a
  // subset (flt_en, flc, drf, olf, opf, cif + calibration); absent fields are omitted.
  flt_en?: number;   // bitwise per-motor fault-enable, opaque to the server
  flc?: number;
  f_dr?: number;
  f_ol?: number;
  f_lr?: number;
  f_opf?: number;
  f_ci?: number;
  dr?: number;
  ol?: number;
  lr?: number;
  ci?: number;
  drf?: number;
  olf?: number;
  lrf?: number;
  opf?: number;
  cif?: number;
  olr?: number;
  lrr?: number;
  cir?: number;
  ig_r?: number;
  ig_y?: number;
  ig_b?: number;
  io_r?: number;
  io_y?: number;
  io_b?: number;
  acknowledgement: "TRUE" | "FALSE";
}

// Stored on starter_settings.multi_motor_config — v_flt_en/sd_time are shared
// (box-level), motors[] holds one block per motor.
export interface MultiMotorSettingsConfig {
  v_flt_en: number;
  sd_time: number;
  motors: MotorSettingsBlock[];
}

export interface MotorSettingsLimitsBlock {
  motor_id: number;
  flc_min: number; flc_max: number;
  f_dr_min: number; f_dr_max: number;
  f_ol_min: number; f_ol_max: number;
  f_lr_min: number; f_lr_max: number;
  f_opf_min: number; f_opf_max: number;
  f_ci_min: number; f_ci_max: number;
  dr_min: number; dr_max: number;
  ol_min: number; ol_max: number;
  lr_min: number; lr_max: number;
  ci_min: number; ci_max: number;
  drf_min: number; drf_max: number;
  olf_min: number; olf_max: number;
  lrf_min: number; lrf_max: number;
  opf_min: number; opf_max: number;
  cif_min: number; cif_max: number;
  olr_min: number; olr_max: number;
  lrr_min: number; lrr_max: number;
  cir_min: number; cir_max: number;
  ig_r_min: number; ig_r_max: number;
  ig_y_min: number; ig_y_max: number;
  ig_b_min: number; ig_b_max: number;
  io_r_min: number; io_r_max: number;
  io_y_min: number; io_y_max: number;
  io_b_min: number; io_b_max: number;
}

// Stored on starter_settings_limits.multi_motor_limits.
export interface MultiMotorSettingsLimitsConfig {
  v_flt_en_min: number; v_flt_en_max: number;
  sd_time_min: number; sd_time_max: number;
  motors: MotorSettingsLimitsBlock[];
}

export type MotorSettingsDefaultsBlock = Omit<MotorSettingsBlock, "motor_id" | "acknowledgement">;

// Stored on starter_default_settings.multi_motor_defaults — a single template
// block the admin UI pre-fills any new motor's settings form with.
export interface MultiMotorSettingsDefaultsConfig {
  v_flt_en: number;
  sd_time: number;
  motor: MotorSettingsDefaultsBlock;
}

// Stored on starter_default_settings_limits.multi_motor_default_limits.
export interface MultiMotorSettingsDefaultLimitsConfig {
  v_flt_en_min: number; v_flt_en_max: number;
  sd_time_min: number; sd_time_max: number;
  motor: Omit<MotorSettingsLimitsBlock, "motor_id">;
}
