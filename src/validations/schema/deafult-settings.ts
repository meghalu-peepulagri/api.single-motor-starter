import * as v from "valibot";
import { enable01, integerOnly, realOnly, requiredText } from "../../helpers/settings-helpers.js";

export const vUpdateDefaultSettings = v.object({
  /* ================= dvc_cnfg ================= */
  dvc_flt_en: enable01("dvc_flt_en"),
  dvc_flc: realOnly("dvc_flc"),
  dvc_st: integerOnly("dvc_st"),

  dvc_flt_ipf: realOnly("dvc_flt_ipf"),
  dvc_flt_lvf: realOnly("dvc_flt_lvf"),
  dvc_flt_hvf: realOnly("dvc_flt_hvf"),
  dvc_flt_vif: realOnly("dvc_flt_vif"),
  dvc_flt_paminf: realOnly("dvc_flt_paminf"),
  dvc_flt_pamaxf: realOnly("dvc_flt_pamaxf"),

  dvc_alt_pfa: realOnly("dvc_alt_pfa"),
  dvc_alt_lva: realOnly("dvc_alt_lva"),
  dvc_alt_hva: realOnly("dvc_alt_hva"),
  dvc_alt_via: realOnly("dvc_alt_via"),
  dvc_alt_pamina: realOnly("dvc_alt_pamina"),
  dvc_alt_pamaxa: realOnly("dvc_alt_pamaxa"),

  dvc_rec_lvr: realOnly("dvc_rec_lvr"),
  dvc_rec_hvr: realOnly("dvc_rec_hvr"),

  /* ================= mtr_cnfg ================= */
  mtr_flt_dr: realOnly("mtr_flt_dr"),
  mtr_flt_ol: realOnly("mtr_flt_ol"),
  mtr_flt_lr: realOnly("mtr_flt_lr"),
  mtr_flt_opf: realOnly("mtr_flt_opf"),
  mtr_flt_ci: realOnly("mtr_flt_ci"),

  mtr_alt_dr: realOnly("mtr_alt_dr"),
  mtr_alt_ol: realOnly("mtr_alt_ol"),
  mtr_alt_lr: realOnly("mtr_alt_lr"),
  mtr_alt_ci: realOnly("mtr_alt_ci"),

  mtr_rec_ol: realOnly("mtr_rec_ol"),
  mtr_rec_lr: realOnly("mtr_rec_lr"),
  mtr_rec_ci: realOnly("mtr_rec_ci"),

  /* ================= atml_cnfg ================= */
  atml_ug_r: integerOnly("atml_ug_r"),
  atml_ug_y: integerOnly("atml_ug_y"),
  atml_ug_b: integerOnly("atml_ug_b"),

  atml_ig_r: integerOnly("atml_ig_r"),
  atml_ig_y: integerOnly("atml_ig_y"),
  atml_ig_b: integerOnly("atml_ig_b"),

  /* ================= mqt_cnfg ================= */
  mqt_ca_fn: requiredText("mqt_ca_fn"),
  mqt_bkr_adrs: requiredText("mqt_bkr_adrs"),
  mqt_c_id: requiredText("mqt_c_id"),
  mqt_emqx_usrn: requiredText("mqt_emqx_usrn"),
  mqt_emqx_pswd: requiredText("mqt_emqx_pswd"),
  mqt_prod_http: requiredText("mqt_prod_http"),
  mqt_bkp_http: requiredText("mqt_bkp_http"),
  mqt_bkr_port: integerOnly("mqt_bkr_port"),
  mqt_ce_len: integerOnly("mqt_ce_len"),

  /* ================= ivrs_cnfg ================= */
  ivrs_sms_pswd: requiredText("ivrs_sms_pswd"),
  ivrs_c_lang: integerOnly("ivrs_c_lang"),
  ivrs_auth_num: v.optional(v.array(v.string())),

  /* ================= frq_cnfg ================= */
  frq_dft_liv_f: integerOnly("frq_dft_liv_f"),
  frq_h_liv_f: integerOnly("frq_h_liv_f"),
  frq_m_liv_f: integerOnly("frq_m_liv_f"),
  frq_l_liv_f: integerOnly("frq_l_liv_f"),
  frq_pwr_info_f: integerOnly("frq_pwr_info_f"),

  /* ================= feats_en ================= */
  feats_ivrs_en: enable01("feats_ivrs_en"),
  feats_sms_en: enable01("feats_sms_en"),
  feats_rmt_en: enable01("feats_rmt_en"),

  /* ================= flt_en ================= */
  flt_en_ipf: enable01("flt_en_ipf"),
  flt_en_lvf: enable01("flt_en_lvf"),
  flt_en_hvf: enable01("flt_en_hvf"),
  flt_en_vif: enable01("flt_en_vif"),
  flt_en_dr: enable01("flt_en_dr"),
  flt_en_ol: enable01("flt_en_ol"),
  flt_en_lr: enable01("flt_en_lr"),
  flt_en_opf: enable01("flt_en_opf"),
  flt_en_ci: enable01("flt_en_ci"),
});

export type ValidatedUpdateDefaultSettings = v.InferOutput<typeof vUpdateDefaultSettings>;