import { sql } from "drizzle-orm";
import { integer, pgTable, real, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
export const starterDefaultSettings = pgTable("starter_default_settings", {
    id: serial("id").primaryKey(),
    // ================= Device Configuration (35 fields) =================
    allflt_en: integer("allflt_en").default(0), // To enable and disable faults
    flc: real("flc").default(1.65), // Motor Full Load Current
    as_dly: integer("as_dly").default(5), // Auto Start Seed Time for Motor
    pr_flt_en: integer("pr_flt_en").default(0),
    tpf: real("tpf").default(0), // Temperature Protection Factor
    // Enables (2 fields)
    v_en: integer("v_en").default(0), // Voltage faults enable
    c_en: integer("c_en").default(0), // Current faults enable
    // Fault Thresholds (13 fields)
    ipf: real("ipf").default(0), // Input Phase Failure
    lvf: real("lvf").default(300), // Low Voltage Fault Threshold
    hvf: real("hvf").default(480), // High Voltage Fault Threshold
    vif: real("vif").default(5), // Voltage Imbalance Fault Threshold
    paminf: real("paminf").default(100), // Minimum Phase Angle for Fault
    pamaxf: real("pamaxf").default(125), // Maximum Phase Angle for Fault
    f_dr: real("f_dr").default(10), // Dry Run Protection Fault Threshold for Motor
    f_ol: real("f_ol").default(120), // Over Load Fault Threshold Motor
    f_lr: real("f_lr").default(350), // Locked Rotor Fault for Motor
    f_opf: real("f_opf").default(0.5), // Output Phase Failure for Motor
    f_ci: real("f_ci").default(15), // Current Imbalance Fault Ratio for Motor
    // Alert Thresholds (12 fields)
    pfa: real("pfa").default(280), // Phase Failure Alert Value
    lva: real("lva").default(340), // Low Voltage Alert Value
    hva: real("hva").default(470), // High Voltage Alert Value
    via: real("via").default(10), // Voltage Imbalance Alert Value
    pamina: real("pamina").default(100), // Minimum Phase Angle Alert Value
    pamaxa: real("pamaxa").default(125), // Maximum Phase Angle Alert Value
    dr: real("dr").default(10), // Dry Run Protection Alert Threshold for Motor
    ol: real("ol").default(110), // Over Load Alert Threshold for Motor
    lr: real("lr").default(300), // Locked Rotor Alert for Motor
    ci: real("ci").default(15), // Current Imbalance Alert Ratio for Motor
    // Recovery Settings (6 fields)
    lvr: real("lvr").default(360), // Low Voltage Recovery
    hvr: real("hvr").default(450), // High Voltage Recovery
    olf: real("olf").default(1), // Over Load Recovery for Motor
    lrf: real("lrf").default(1), // Locked Rotor Recovery for Motor
    opf: real("opf").default(0.5), // Motor output phase failure
    cif: real("cif").default(0.5), // Current Imbalance Recovery for Motor
    drf: real("drf").default(5), // Dry Run Recovery for Motor
    lrr: real("lrr").default(10), // Inrush Current Recovery for Motor
    olr: real("olr").default(10), // Over Load Recovery Time for Motor
    cir: real("cir").default(10), // Current Imbalance Recovery Time for Motor
    // Primary enable faluts
    vflt_under_voltage: integer("vflt_under_voltage").default(0),
    vflt_over_voltage: integer("vflt_over_voltage").default(0),
    vflt_voltage_imbalance: integer("vflt_voltage_imbalance").default(0),
    vflt_phase_failure: integer("vflt_phase_failure").default(0),
    cflt_dry_run: integer("cflt_dry_run").default(0),
    cflt_over_current: integer("cflt_over_current").default(0),
    cflt_output_phase_fail: integer("cflt_output_phase_fail").default(0),
    cflt_curr_imbalance: integer("cflt_curr_imbalance").default(0),
    // ================= Calibrations =================
    // ATMEL Calibrations (6 fields)
    ug_r: integer("ug_r").default(50567),
    ug_y: integer("ug_y").default(49867),
    ug_b: integer("ug_b").default(51078),
    ip_r: integer("ip_r").default(8974),
    ip_y: integer("ip_y").default(8974),
    ip_b: integer("ip_b").default(8974),
    // ADC Calibrations (12 fields)
    vg_r: real("vg_r").default(0),
    vg_y: real("vg_y").default(0),
    vg_b: real("vg_b").default(0),
    vo_r: real("vo_r").default(0),
    vo_y: real("vo_y").default(0),
    vo_b: real("vo_b").default(0),
    ig_r: real("ig_r").default(0),
    ig_y: real("ig_y").default(0),
    ig_b: real("ig_b").default(0),
    io_r: real("io_r").default(0),
    io_y: real("io_y").default(0),
    io_b: real("io_b").default(0),
    // PT100/PT1000 Calibrations (3 fields)
    r1: integer("r1").default(0),
    r2: integer("r2").default(0),
    off: integer("off").default(0),
    // ================= MQTT Configuration (8 fields) =================
    ca_fn: varchar("ca_fn", { length: 100 }).default(""),
    bkr_adrs: varchar("bkr_adrs", { length: 100 }).default(""),
    sn: varchar("sn", { length: 50 }).default(""),
    usrn: varchar("usrn", { length: 50 }).default(""),
    pswd: varchar("pswd", { length: 50 }).default(""),
    prd_url: varchar("prd_url", { length: 100 }).default(""),
    port: integer("port").default(1883),
    crt_en: integer("crt_en").default(2048),
    // ================= IVRS Configuration (3 fields) =================
    sms_pswd: varchar("sms_pswd", { length: 20 }).default(""),
    c_lang: integer("c_lang").default(1),
    auth_num: varchar("auth_num", { length: 10 }).array(),
    // ================= Frequency Configuration (5 fields) =================
    dft_liv_f: integer("dft_liv_f").default(5),
    h_liv_f: integer("h_liv_f").default(2),
    m_liv_f: integer("m_liv_f").default(4),
    l_liv_f: integer("l_liv_f").default(3),
    pwr_info_f: integer("pwr_info_f").default(20),
    // ================= Feature Enables (3 fields) =================
    ivrs_en: integer("ivrs_en").default(0),
    sms_en: integer("sms_en").default(0),
    rmt_en: integer("rmt_en").default(0),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow().default(sql `CURRENT_TIMESTAMP`)
});
