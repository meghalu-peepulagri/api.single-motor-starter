import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, real, serial, timestamp } from "drizzle-orm/pg-core";
import { starterBoxes } from "./starter-boxes.js";
export const starterSettingsLimits = pgTable("starter_settings_limits", {
    id: serial("id").primaryKey(),
    starter_id: integer("starter_id").references(() => starterBoxes.id).notNull(),
    /* ================= Device Configuration Limits ================= */
    // Full Load Current Limits
    dvc_flc_min: real("dvc_flc_min").default(1.0),
    dvc_flc_max: real("dvc_flc_max").default(10.0),
    // Fault Threshold Limits
    dvc_flt_ipf_min: real("dvc_flt_ipf_min").default(0.0),
    dvc_flt_ipf_max: real("dvc_flt_ipf_max").default(300.0),
    dvc_flt_lvf_min: real("dvc_flt_lvf_min").default(300.0),
    dvc_flt_lvf_max: real("dvc_flt_lvf_max").default(380.0),
    dvc_flt_hvf_min: real("dvc_flt_hvf_min").default(480.0),
    dvc_flt_hvf_max: real("dvc_flt_hvf_max").default(550.0),
    dvc_flt_vif_min: real("dvc_flt_vif_min").default(5.0),
    dvc_flt_vif_max: real("dvc_flt_vif_max").default(30.0),
    dvc_flt_paminf_min: real("dvc_flt_paminf_min").default(100.0),
    dvc_flt_paminf_max: real("dvc_flt_paminf_max").default(110.0),
    dvc_flt_pamaxf_min: real("dvc_flt_pamaxf_min").default(125.0),
    dvc_flt_pamaxf_max: real("dvc_flt_pamaxf_max").default(130.0),
    dvc_flt_fminf_min: real("dvc_flt_fminf_min").default(45.0),
    dvc_flt_fminf_max: real("dvc_flt_fminf_max").default(48.0),
    dvc_flt_fmaxf_min: real("dvc_flt_fmaxf_min").default(51.0),
    dvc_flt_fmaxf_max: real("dvc_flt_fmaxf_max").default(55.0),
    // Alert Threshold Limits
    dvc_alt_pfa_min: real("dvc_alt_pfa_min").default(280.0),
    dvc_alt_pfa_max: real("dvc_alt_pfa_max").default(360.0),
    dvc_alt_lva_min: real("dvc_alt_lva_min").default(340.0),
    dvc_alt_lva_max: real("dvc_alt_lva_max").default(380.0),
    dvc_alt_hva_min: real("dvc_alt_hva_min").default(470.0),
    dvc_alt_hva_max: real("dvc_alt_hva_max").default(500.0),
    dvc_alt_via_min: real("dvc_alt_via_min").default(10.0),
    dvc_alt_via_max: real("dvc_alt_via_max").default(20.0),
    dvc_alt_pamina_min: real("dvc_alt_pamina_min").default(100.0),
    dvc_alt_pamina_max: real("dvc_alt_pamina_max").default(115.0),
    dvc_alt_pamaxa_min: real("dvc_alt_pamaxa_min").default(125.0),
    dvc_alt_pamaxa_max: real("dvc_alt_pamaxa_max").default(135.0),
    dvc_alt_fmina_min: real("dvc_alt_fmina_min").default(46.0),
    dvc_alt_fmina_max: real("dvc_alt_fmina_max").default(49.0),
    dvc_alt_fmaxa_min: real("dvc_alt_fmaxa_min").default(51.5),
    dvc_alt_fmaxa_max: real("dvc_alt_fmaxa_max").default(55.0),
    // Recovery Threshold Limits
    dvc_rec_lvr_min: real("dvc_rec_lvr_min").default(360.0),
    dvc_rec_lvr_max: real("dvc_rec_lvr_max").default(400.0),
    dvc_rec_hvr_min: real("dvc_rec_hvr_min").default(450.0),
    dvc_rec_hvr_max: real("dvc_rec_hvr_max").default(470.0),
    /* ================= Motor Configuration Limits ================= */
    // Motor Fault Threshold Limits
    mtr_flt_dr_min: real("mtr_flt_dr_min").default(10.0),
    mtr_flt_dr_max: real("mtr_flt_dr_max").default(50.0),
    mtr_flt_ol_min: real("mtr_flt_ol_min").default(120.0),
    mtr_flt_ol_max: real("mtr_flt_ol_max").default(150.0),
    mtr_flt_lr_min: real("mtr_flt_lr_min").default(350.0),
    mtr_flt_lr_max: real("mtr_flt_lr_max").default(450.0),
    mtr_flt_ci_min: real("mtr_flt_ci_min").default(15.0),
    mtr_flt_ci_max: real("mtr_flt_ci_max").default(35.0),
    // Motor Alert Threshold Limits
    mtr_alt_dr_min: real("mtr_alt_dr_min").default(10.0),
    mtr_alt_dr_max: real("mtr_alt_dr_max").default(60.0),
    mtr_alt_ol_min: real("mtr_alt_ol_min").default(110.0),
    mtr_alt_ol_max: real("mtr_alt_ol_max").default(150.0),
    mtr_alt_lr_min: real("mtr_alt_lr_min").default(300.0),
    mtr_alt_lr_max: real("mtr_alt_lr_max").default(400.0),
    mtr_alt_ci_min: real("mtr_alt_ci_min").default(15.0),
    mtr_alt_ci_max: real("mtr_alt_ci_max").default(30.0),
    // Motor Recovery Limits
    mtr_rec_ci_min: real("mtr_rec_ci_min").default(0.5),
    mtr_rec_ci_max: real("mtr_rec_ci_max").default(1.0),
    /* ================= Atmel Calibration Limits ================= */
    atml_ug_r_min: real("atml_ug_r_min").default(1.0),
    atml_ug_r_max: real("atml_ug_r_max").default(65536.0),
    atml_ug_y_min: real("atml_ug_y_min").default(1.0),
    atml_ug_y_max: real("atml_ug_y_max").default(65536.0),
    atml_ug_b_min: real("atml_ug_b_min").default(1.0),
    atml_ug_b_max: real("atml_ug_b_max").default(65536.0),
    atml_ig_r_min: real("atml_ig_r_min").default(1.0),
    atml_ig_r_max: real("atml_ig_r_max").default(65536.0),
    atml_ig_y_min: real("atml_ig_y_min").default(1.0),
    atml_ig_y_max: real("atml_ig_y_max").default(65536.0),
    atml_ig_b_min: real("atml_ig_b_min").default(1.0),
    atml_ig_b_max: real("atml_ig_b_max").default(65536.0),
    atml_tpf_min: real("atml_tpf_min").default(0.0),
    atml_tpf_max: real("atml_tpf_max").default(10.0),
    /* ================= Frequency Configuration Limits ================= */
    frq_dft_liv_f_min: real("frq_dft_liv_f_min").default(1.0),
    frq_dft_liv_f_max: real("frq_dft_liv_f_max").default(30.0),
    frq_h_liv_f_min: real("frq_h_liv_f_min").default(1.0),
    frq_h_liv_f_max: real("frq_h_liv_f_max").default(30.0),
    frq_m_liv_f_min: real("frq_m_liv_f_min").default(1.0),
    frq_m_liv_f_max: real("frq_m_liv_f_max").default(30.0),
    frq_l_liv_f_min: real("frq_l_liv_f_min").default(1.0),
    frq_l_liv_f_max: real("frq_l_liv_f_max").default(30.0),
    frq_pwr_info_f_min: real("frq_pwr_info_f_min").default(1.0),
    frq_pwr_info_f_max: real("frq_pwr_info_f_max").default(30.0),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql `CURRENT_TIMESTAMP`)
}, (table) => [
    index("starter_settings_limits_idx").on(table.starter_id),
]);
export const starterSettingsLimitsRelations = relations(starterSettingsLimits, ({ one }) => ({
    starter: one(starterBoxes, {
        fields: [starterSettingsLimits.starter_id],
        references: [starterBoxes.id],
    }),
}));
