import { sql } from "drizzle-orm";
import { integer, pgTable, real, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const StarterDefaultSettingsLimits = pgTable("starter_default_settings_limits", {
  id: serial("id").primaryKey(),

  // ================= Device Configurations – Settings =================

  pr_flt_en_min: integer("pr_flt_en_min").default(0),
  pr_flt_en_max: integer("pr_flt_en_max").default(65355),

  flc_min: real("flc_min").default(1.0),
  flc_max: real("flc_max").default(10.0),

  as_dly_min: integer("as_dly_min").default(5),
  as_dly_max: integer("as_dly_max"),

  tpf_min: real("tpf_min").default(0),
  tpf_max: real("tpf_max").default(10),

  // Enables
  v_en: integer("v_en").default(0),
  c_en: integer("c_en").default(0),

  // ================= Fault Thresholds =================
  ipf_min: real("ipf_min").default(0.0),
  ipf_max: real("ipf_max").default(300.0),

  lvf_min: real("lvf_min").default(300),
  lvf_max: real("lvf_max").default(380),

  hvf_min: real("hvf_min").default(480),
  hvf_max: real("hvf_max").default(550),

  vif_min: real("vif_min").default(5),
  vif_max: real("vif_max").default(30),

  paminf_min: real("paminf_min").default(100),
  paminf_max: real("paminf_max").default(110),

  pamaxf_min: real("pamaxf_min").default(125),
  pamaxf_max: real("pamaxf_max").default(130),

  f_dr_min: real("f_dr_min").default(10),
  f_dr_max: real("f_dr_max").default(50),

  f_ol_min: real("f_ol_min").default(120),
  f_ol_max: real("f_ol_max").default(150),

  f_lr_min: real("f_lr_min").default(350),
  f_lr_max: real("f_lr_max").default(450),

  f_opf: real("f_opf").default(0.5),
  f_ci_min: real("f_ci_min").default(15),
  f_ci_max: real("f_ci_max").default(35),

  // ================= Alert Thresholds =================
  pfa_min: real("pfa_min").default(280),
  pfa_max: real("pfa_max").default(360),

  lva_min: real("lva_min").default(340),
  lva_max: real("lva_max").default(380),

  hva_min: real("hva_min").default(470),
  hva_max: real("hva_max").default(500),

  via_min: real("via_min").default(10),
  via_max: real("via_max").default(20),

  pamina_min: real("pamina_min").default(100),
  pamina_max: real("pamina_max").default(115),

  pamaxa_min: real("pamaxa_min").default(125),
  pamaxa_max: real("pamaxa_max").default(135),

  dr_min: real("dr_min").default(10),
  dr_max: real("dr_max").default(60),

  ol_min: real("ol_min").default(110),
  ol_max: real("ol_max").default(150),

  lr_min: real("lr_min").default(300),
  lr_max: real("lr_max").default(400),

  ci_min: real("ci_min").default(15),
  ci_max: real("ci_max").default(30),

  // ================= Recovery Settings =================
  lvr_min: real("lvr_min").default(360),
  lvr_max: real("lvr_max").default(400),

  hvr_min: real("hvr_min").default(450),
  hvr_max: real("hvr_max").default(470),

  olf_min: real("olf_min").default(1),
  olf_max: real("olf_max").default(9),

  lrf_min: real("lrf_min").default(1),
  lrf_max: real("lrf_max").default(9),

  opf_min: real("opf_min").default(0.5),
  opf_max: real("opf_max").default(1.0),

  cif_min: real("cif_min").default(0.5),
  cif_max: real("cif_max").default(1.0),

  drf_min: real("drf_min").default(5),
  drf_max: real("drf_max").default(20),

  lrr_min: real("irr_min").default(10),
  lrr_max: real("irr_max").default(50),

  olr_min: real("olr_min").default(10),
  olr_max: real("olr_max").default(50),

  cir_min: real("cir_min").default(10),
  cir_max: real("cir_max").default(50),

  // ================= ATMEL Calibrations =================
  ug_r_min: real("ug_r_min").default(1),
  ug_r_max: real("ug_r_max").default(65536),

  ug_y_min: real("ug_y_min").default(1),
  ug_y_max: real("ug_y_max").default(65536),

  ug_b_min: real("ug_b_min").default(1),
  ug_b_max: real("ug_b_max").default(65536),

  ip_r_min: real("ip_r_min").default(1),
  ip_r_max: real("ip_r_max").default(65536),

  ip_y_min: real("ip_y_min").default(1),
  ip_y_max: real("ip_y_max").default(65536),

  ip_b_min: real("ip_b_min").default(1),
  ip_b_max: real("ip_b_max").default(65536),
  // ================= ADC Calibrations =================
  vg_r_min: real("vg_r_min").default(0),
  vg_r_max: real("vg_r_max").default(0),

  vg_y_min: real("vg_y_min").default(0),
  vg_y_max: real("vg_y_max").default(0),

  vg_b_min: real("vg_b_min").default(0),
  vg_b_max: real("vg_b_max").default(0),

  vo_r_min: real("vo_r_min").default(0),
  vo_r_max: real("vo_r_max").default(0),

  vo_y_min: real("vo_y_min").default(0),
  vo_y_max: real("vo_y_max").default(0),

  vo_b_min: real("vo_b_min").default(0),
  vo_b_max: real("vo_b_max").default(0),

  ig_r_min: real("ig_r_min").default(1),
  ig_r_max: real("ig_r_max").default(65536),

  ig_y_min: real("ig_y_min").default(1),
  ig_y_max: real("ig_y_max").default(65536),

  ig_b_min: real("ig_b_min").default(1),
  ig_b_max: real("ig_b_max").default(65536),

  io_r_min: real("io_r_min").default(0),
  io_r_max: real("io_r_max").default(0),

  io_y_min: real("io_y_min").default(0),
  io_y_max: real("io_y_max").default(0),

  io_b_min: real("io_b_min").default(0),
  io_b_max: real("io_b_max").default(0),

  limit_min: real("limit_min").default(0),
  limit_max: real("limit_max").default(150),

  // ================= PT100/PT1000 Calibrations =================
  r1: integer("r1").default(0),
  r2: integer("r2").default(0),
  off: integer("off").default(0),

  // ================= MQTT Configuration =================
  ca_fn: varchar("ca_fn", { length: 100 }),
  bkr_adrs: varchar("bkr_adrs", { length: 100 }),
  sn: varchar("sn", { length: 50 }),
  usrn: varchar("usrn", { length: 50 }),
  pswd: varchar("pswd", { length: 50 }),
  prd_url: varchar("prd_url", { length: 100 }),
  port: integer("port").default(1883),
  crt_en: integer("crt_en").default(2048),

  // ================= IVRS Configuration =================
  sms_pswd: varchar("sms_pswd", { length: 20 }),
  c_lang: integer("c_lang").default(1),
  auth_num: varchar("auth_num", { length: 15 }).array(),

  // ================= Frequency Configuration =================
  dft_liv_f: integer("dft_liv_f").default(5),
  h_liv_f: integer("h_liv_f").default(2),
  m_liv_f: integer("m_liv_f").default(4),
  l_liv_f: integer("l_liv_f").default(3),
  pwr_info_f: integer("pwr_info_f").default(20),
  // ================= Feature Enables =================
  ivrs_en: integer("ivrs_en").default(0),
  sms_en: integer("sms_en").default(0),
  rmt_en: integer("rmt_en").default(0),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().default(sql`CURRENT_TIMESTAMP`)
});

export type StarterDefaultSettingsLimits = typeof StarterDefaultSettingsLimits.$inferSelect;
export type NewStarterDefaultSettingsLimits = typeof StarterDefaultSettingsLimits.$inferInsert;
export type StarterDefaultSettingsLimitsTable = typeof StarterDefaultSettingsLimits;