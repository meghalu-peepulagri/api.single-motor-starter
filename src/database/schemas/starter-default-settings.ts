import { sql } from "drizzle-orm";
import { integer, json, pgTable, real, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const starterDefaultSettings = pgTable("starter_default_settings", {
  id: serial("id").primaryKey(),

  /* ================= dvc_cnfg — Device Configuration ================= */

  dvc_flt_en: integer("dvc_flt_en").default(0),
  dvc_flc: real("dvc_flc"),
  dvc_st: integer("dvc_st"),

  dvc_flt_ipf: real("dvc_flt_ipf"),
  dvc_flt_lvf: real("dvc_flt_lvf"),
  dvc_flt_hvf: real("dvc_flt_hvf"),
  dvc_flt_vif: real("dvc_flt_vif"),
  dvc_flt_paminf: real("dvc_flt_paminf"),
  dvc_flt_pamaxf: real("dvc_flt_pamaxf"),

  dvc_alt_pfa: real("dvc_alt_pfa"),
  dvc_alt_lva: real("dvc_alt_lva"),
  dvc_alt_hva: real("dvc_alt_hva"),
  dvc_alt_via: real("dvc_alt_via"),
  dvc_alt_pamina: real("dvc_alt_pamina"),
  dvc_alt_pamaxa: real("dvc_alt_pamaxa"),

  dvc_rec_lvr: real("dvc_rec_lvr"),
  dvc_rec_hvr: real("dvc_rec_hvr"),

  /* ================= mtr_cnfg — Motor Configuration ================= */

  mtr_flt_dr: real("mtr_flt_dr"),
  mtr_flt_ol: real("mtr_flt_ol"),
  mtr_flt_lr: real("mtr_flt_lr"),
  mtr_flt_opf: real("mtr_flt_opf"),
  mtr_flt_ci: real("mtr_flt_ci"),

  mtr_alt_dr: real("mtr_alt_dr"),
  mtr_alt_ol: real("mtr_alt_ol"),
  mtr_alt_lr: real("mtr_alt_lr"),
  mtr_alt_ci: real("mtr_alt_ci"),

  mtr_rec_ol: real("mtr_rec_ol"),
  mtr_rec_lr: real("mtr_rec_lr"),
  mtr_rec_ci: real("mtr_rec_ci"),

  /* ================= atml_cnfg — Atmel Calibration ================= */

  atml_ug_r: integer("atml_ug_r"),
  atml_ug_y: integer("atml_ug_y"),
  atml_ug_b: integer("atml_ug_b"),

  atml_ig_r: integer("atml_ig_r"),
  atml_ig_y: integer("atml_ig_y"),
  atml_ig_b: integer("atml_ig_b"),

  /* ================= mqt_cnfg — MQTT & Server ================= */

  mqt_ca_fn: varchar("mqt_ca_fn"),
  mqt_bkr_adrs: varchar("mqt_bkr_adrs"),
  mqt_c_id: varchar("mqt_c_id"),
  mqt_emqx_usrn: varchar("mqt_emqx_usrn"),
  mqt_emqx_pswd: varchar("mqt_emqx_pswd"),
  mqt_prod_http: varchar("mqt_prod_http"),
  mqt_bkp_http: varchar("mqt_bkp_http"),
  mqt_bkr_port: integer("mqt_bkr_port"),
  mqt_ce_len: integer("mqt_ce_len"),

  /* ================= ivrs_cnfg — IVRS ================= */

  ivrs_sms_pswd: varchar("ivrs_sms_pswd"),
  ivrs_c_lang: integer("ivrs_c_lang"),
  ivrs_auth_num: json("ivrs_auth_num").$type<string[]>(),

  /* ================= frq_cnfg — Frequency ================= */

  frq_dft_liv_f: integer("frq_dft_liv_f"),
  frq_h_liv_f: integer("frq_h_liv_f"),
  frq_m_liv_f: integer("frq_m_liv_f"),
  frq_l_liv_f: integer("frq_l_liv_f"),
  frq_pwr_info_f: integer("frq_pwr_info_f"),

  /* ================= feats_en — Feature Enable ================= */

  feats_ivrs_en: integer("feats_ivrs_en").default(0),
  feats_sms_en: integer("feats_sms_en").default(1),
  feats_rmt_en: integer("feats_rmt_en").default(0),

  /* ================= flt_en — Individual Fault Enable ================= */

  flt_en_ipf: integer("flt_en_ipf").default(1),
  flt_en_lvf: integer("flt_en_lvf").default(1),
  flt_en_hvf: integer("flt_en_hvf").default(1),
  flt_en_vif: integer("flt_en_vif").default(1),
  flt_en_dr: integer("flt_en_dr").default(1),
  flt_en_ol: integer("flt_en_ol").default(1),
  flt_en_lr: integer("flt_en_lr").default(1),
  flt_en_opf: integer("flt_en_opf").default(1),
  flt_en_ci: integer("flt_en_ci").default(1),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().default(sql`CURRENT_TIMESTAMP`)
}
);

export type StarterDefaultSettings = typeof starterDefaultSettings.$inferSelect;
export type NewStarterDefaultSettings = typeof starterDefaultSettings.$inferInsert;
export type StarterDefaultSettingsTable = typeof starterDefaultSettings;