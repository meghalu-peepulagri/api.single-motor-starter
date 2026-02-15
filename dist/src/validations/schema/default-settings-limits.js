import * as v from "valibot";
/**
 * Enhanced validation for settings limits with comprehensive checks:
 * - Type safety (string to number conversion)
 * - Non-negative values enforcement
 * - Decimal precision control
 * - NaN, Infinity rejection
 * - Min/Max relationship validation
 */
/**
 * Validation helper for real numbers in limits (non-negative, max 2 decimals)
 */
const realLimitValue = (fieldName, options) => {
    const dp = options?.decimalPlaces ?? 2;
    const factor = Math.pow(10, dp);
    return v.pipe(v.union([v.number(), v.string()], `${fieldName} must be a valid number`), v.transform((val) => {
        if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed === '') {
                throw new Error(`${fieldName} cannot be empty`);
            }
            const parsed = Number(trimmed);
            if (isNaN(parsed)) {
                throw new Error(`${fieldName} must be a valid number, received "${val}"`);
            }
            return parsed;
        }
        return val;
    }), v.check((val) => typeof val === 'number' && !isNaN(val), `${fieldName} must be a valid number, not NaN`), v.check((val) => isFinite(val), `${fieldName} must be a finite number (not Infinity or -Infinity)`), v.check((val) => val >= 0, `${fieldName} cannot be negative (negative values not allowed)`), v.check((val) => {
        const decimalCount = val.toString().split('.')[1]?.length || 0;
        return decimalCount <= dp;
    }, `${fieldName} can have maximum ${dp} decimal places`), v.transform((val) => {
        return Math.round(val * factor) / factor;
    }));
};
/**
 * Validation helper for integer values in limits (non-negative)
 */
const integerLimitValue = (fieldName) => v.pipe(v.union([v.number(), v.string()], `${fieldName} must be a valid integer`), v.transform((val) => {
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '') {
            throw new Error(`${fieldName} cannot be empty`);
        }
        const parsed = Number(trimmed);
        if (isNaN(parsed)) {
            throw new Error(`${fieldName} must be a valid integer, received "${val}"`);
        }
        return parsed;
    }
    return val;
}), v.check((val) => typeof val === 'number' && !isNaN(val), `${fieldName} must be a valid number, not NaN`), v.check((val) => isFinite(val), `${fieldName} must be a finite number (not Infinity or -Infinity)`), v.check((val) => Number.isInteger(val), `${fieldName} must be an integer without decimal places`), v.check((val) => val >= 0, `${fieldName} cannot be negative (negative values not allowed)`));
const baseSchema = v.object({
    // ================= Device Configurations – Settings =================
    pr_flt_en_min: integerLimitValue("Pre-fault enable minimum"),
    pr_flt_en_max: integerLimitValue("Pre-fault enable maximum"),
    flc_min: realLimitValue("Full load current minimum"),
    flc_max: realLimitValue("Full load current maximum"),
    as_dly_min: integerLimitValue("Auto start delay minimum"),
    as_dly_max: integerLimitValue("Auto start delay maximum"),
    tpf_min: realLimitValue("Time per fault minimum"),
    tpf_max: realLimitValue("Time per fault maximum"),
    // Enables
    v_en: integerLimitValue("Voltage enable"),
    c_en: integerLimitValue("Current enable"),
    // ================= Fault Thresholds =================
    ipf_min: realLimitValue("Input phase failure fault min"),
    ipf_max: realLimitValue("Input phase failure fault max"),
    lvf_min: realLimitValue("Low voltage fault min"),
    lvf_max: realLimitValue("Low voltage fault max"),
    hvf_min: realLimitValue("High voltage fault min"),
    hvf_max: realLimitValue("High voltage fault max"),
    vif_min: realLimitValue("Voltage imbalance fault min"),
    vif_max: realLimitValue("Voltage imbalance fault max"),
    paminf_min: realLimitValue("Phase angle min fault min"),
    paminf_max: realLimitValue("Phase angle min fault max"),
    pamaxf_min: realLimitValue("Phase angle max fault min"),
    pamaxf_max: realLimitValue("Phase angle max fault max"),
    f_dr_min: realLimitValue("Dry run fault min"),
    f_dr_max: realLimitValue("Dry run fault max"),
    f_ol_min: realLimitValue("Overload fault min"),
    f_ol_max: realLimitValue("Overload fault max"),
    f_lr_min: realLimitValue("Locked rotor fault min"),
    f_lr_max: realLimitValue("Locked rotor fault max"),
    f_opf: realLimitValue("Output phase failure fault"),
    f_ci_min: realLimitValue("Current imbalance fault min"),
    f_ci_max: realLimitValue("Current imbalance fault max"),
    // ================= Alert Thresholds =================
    pfa_min: realLimitValue("Phase failure alert min"),
    pfa_max: realLimitValue("Phase failure alert max"),
    lva_min: realLimitValue("Low voltage alert min"),
    lva_max: realLimitValue("Low voltage alert max"),
    hva_min: realLimitValue("High voltage alert min"),
    hva_max: realLimitValue("High voltage alert max"),
    via_min: realLimitValue("Voltage imbalance alert min"),
    via_max: realLimitValue("Voltage imbalance alert max"),
    pamina_min: realLimitValue("Phase angle min alert min"),
    pamina_max: realLimitValue("Phase angle min alert max"),
    pamaxa_min: realLimitValue("Phase angle max alert min"),
    pamaxa_max: realLimitValue("Phase angle max alert max"),
    dr_min: realLimitValue("Dry run alert min"),
    dr_max: realLimitValue("Dry run alert max"),
    ol_min: realLimitValue("Overload alert min"),
    ol_max: realLimitValue("Overload alert max"),
    lr_min: realLimitValue("Locked rotor alert min"),
    lr_max: realLimitValue("Locked rotor alert max"),
    ci_min: realLimitValue("Current imbalance alert min"),
    ci_max: realLimitValue("Current imbalance alert max"),
    // ================= Recovery Settings =================
    lvr_min: realLimitValue("Low voltage recovery min"),
    lvr_max: realLimitValue("Low voltage recovery max"),
    hvr_min: realLimitValue("High voltage recovery min"),
    hvr_max: realLimitValue("High voltage recovery max"),
    olf_min: realLimitValue("Overload recovery factor min"),
    olf_max: realLimitValue("Overload recovery factor max"),
    lrf_min: realLimitValue("Locked rotor recovery factor min"),
    lrf_max: realLimitValue("Locked rotor recovery factor max"),
    opf_min: realLimitValue("Output phase failure recovery min"),
    opf_max: realLimitValue("Output phase failure recovery max"),
    cif_min: realLimitValue("Current imbalance recovery factor min"),
    cif_max: realLimitValue("Current imbalance recovery factor max"),
    drf_min: realLimitValue("Dry run recovery min"),
    drf_max: realLimitValue("Dry run recovery max"),
    lrr_min: realLimitValue("Inrush current recovery min"),
    lrr_max: realLimitValue("Inrush current recovery max"),
    olr_min: realLimitValue("Overload recovery time min"),
    olr_max: realLimitValue("Overload recovery time max"),
    cir_min: realLimitValue("Current imbalance recovery time min"),
    cir_max: realLimitValue("Current imbalance recovery time max"),
    // ================= ATMEL Calibrations =================
    ug_r_min: realLimitValue("Voltage gain R min"),
    ug_r_max: realLimitValue("Voltage gain R max"),
    ug_y_min: realLimitValue("Voltage gain Y min"),
    ug_y_max: realLimitValue("Voltage gain Y max"),
    ug_b_min: realLimitValue("Voltage gain B min"),
    ug_b_max: realLimitValue("Voltage gain B max"),
    ip_r_min: realLimitValue("Current gain R min"),
    ip_r_max: realLimitValue("Current gain R max"),
    ip_y_min: realLimitValue("Current gain Y min"),
    ip_y_max: realLimitValue("Current gain Y max"),
    ip_b_min: realLimitValue("Current gain B min"),
    ip_b_max: realLimitValue("Current gain B max"),
    // ================= ADC Calibrations =================
    vg_r_min: realLimitValue("Voltage gain R (ADC) min", { decimalPlaces: 5 }),
    vg_r_max: realLimitValue("Voltage gain R (ADC) max", { decimalPlaces: 5 }),
    vg_y_min: realLimitValue("Voltage gain Y (ADC) min", { decimalPlaces: 5 }),
    vg_y_max: realLimitValue("Voltage gain Y (ADC) max", { decimalPlaces: 5 }),
    vg_b_min: realLimitValue("Voltage gain B (ADC) min", { decimalPlaces: 5 }),
    vg_b_max: realLimitValue("Voltage gain B (ADC) max", { decimalPlaces: 5 }),
    vo_r_min: realLimitValue("Voltage offset R (ADC) min"),
    vo_r_max: realLimitValue("Voltage offset R (ADC) max"),
    vo_y_min: realLimitValue("Voltage offset Y (ADC) min"),
    vo_y_max: realLimitValue("Voltage offset Y (ADC) max"),
    vo_b_min: realLimitValue("Voltage offset B (ADC) min"),
    vo_b_max: realLimitValue("Voltage offset B (ADC) max"),
    ig_r_min: realLimitValue("Current gain R (ADC) min", { decimalPlaces: 5 }),
    ig_r_max: realLimitValue("Current gain R (ADC) max", { decimalPlaces: 5 }),
    ig_y_min: realLimitValue("Current gain Y (ADC) min", { decimalPlaces: 5 }),
    ig_y_max: realLimitValue("Current gain Y (ADC) max", { decimalPlaces: 5 }),
    ig_b_min: realLimitValue("Current gain B (ADC) min", { decimalPlaces: 5 }),
    ig_b_max: realLimitValue("Current gain B (ADC) max", { decimalPlaces: 5 }),
    io_r_min: realLimitValue("Current offset R (ADC) min"),
    io_r_max: realLimitValue("Current offset R (ADC) max"),
    io_y_min: realLimitValue("Current offset Y (ADC) min"),
    io_y_max: realLimitValue("Current offset Y (ADC) max"),
    io_b_min: realLimitValue("Current offset B (ADC) min"),
    io_b_max: realLimitValue("Current offset B (ADC) max"),
    // ================= PT100/PT1000 Calibrations =================
    r1: integerLimitValue("RTD resistance R1"),
    r2: integerLimitValue("RTD resistance R2"),
    off: integerLimitValue("RTD temperature offset"),
    // ================= MQTT Configuration =================
    ca_fn: v.nullish(v.optional(v.string("CA filename must be string"))),
    bkr_adrs: v.nullish(v.optional(v.string("Broker address must be string"))),
    sn: v.nullish(v.optional(v.string("Serial number must be string"))),
    usrn: v.nullish(v.optional(v.string("Username must be string"))),
    pswd: v.nullish(v.optional(v.string("Password must be string"))),
    prd_url: v.nullish(v.optional(v.string("Prod URL must be string"))),
    port: integerLimitValue("MQTT port"),
    crt_en: integerLimitValue("Certificate enable"),
    // ================= IVRS Configuration =================
    sms_pswd: v.nullish(v.optional(v.string("SMS password must be string"))),
    c_lang: integerLimitValue("Communication language"),
    auth_num: v.nullish(v.optional(v.array(v.string("Authorized number must be string")))),
    // ================= Frequency Configuration =================
    dft_liv_f: integerLimitValue("Default live frequency"),
    h_liv_f: integerLimitValue("High priority frequency"),
    m_liv_f: integerLimitValue("Medium priority frequency"),
    l_liv_f: integerLimitValue("Low priority frequency"),
    pwr_info_f: integerLimitValue("Power info frequency"),
    // ================= Feature Enables =================
    ivrs_en: integerLimitValue("IVRS enable"),
    sms_en: integerLimitValue("SMS enable"),
    rmt_en: integerLimitValue("Remote enable"),
});
/**
 * Min/Max relationship validation pairs
 * Format: [minField, maxField, displayName]
 */
const minMaxPairs = [
    // Device Configuration
    ['pr_flt_en_min', 'pr_flt_en_max', 'Pre-fault enable'],
    ['flc_min', 'flc_max', 'Full load current'],
    ['as_dly_min', 'as_dly_max', 'Auto start delay'],
    ['tpf_min', 'tpf_max', 'Time per fault'],
    // Fault Thresholds
    ['ipf_min', 'ipf_max', 'Input phase failure fault'],
    ['lvf_min', 'lvf_max', 'Low voltage fault'],
    ['hvf_min', 'hvf_max', 'High voltage fault'],
    ['vif_min', 'vif_max', 'Voltage imbalance fault'],
    ['paminf_min', 'paminf_max', 'Phase angle min fault'],
    ['pamaxf_min', 'pamaxf_max', 'Phase angle max fault'],
    ['f_dr_min', 'f_dr_max', 'Dry run fault'],
    ['f_ol_min', 'f_ol_max', 'Overload fault'],
    ['f_lr_min', 'f_lr_max', 'Locked rotor fault'],
    ['f_ci_min', 'f_ci_max', 'Current imbalance fault'],
    // Alert Thresholds
    ['pfa_min', 'pfa_max', 'Phase failure alert'],
    ['lva_min', 'lva_max', 'Low voltage alert'],
    ['hva_min', 'hva_max', 'High voltage alert'],
    ['via_min', 'via_max', 'Voltage imbalance alert'],
    ['pamina_min', 'pamina_max', 'Phase angle min alert'],
    ['pamaxa_min', 'pamaxa_max', 'Phase angle max alert'],
    ['dr_min', 'dr_max', 'Dry run alert'],
    ['ol_min', 'ol_max', 'Overload alert'],
    ['lr_min', 'lr_max', 'Locked rotor alert'],
    ['ci_min', 'ci_max', 'Current imbalance alert'],
    // Recovery Settings
    ['lvr_min', 'lvr_max', 'Low voltage recovery'],
    ['hvr_min', 'hvr_max', 'High voltage recovery'],
    ['olf_min', 'olf_max', 'Overload recovery factor'],
    ['lrf_min', 'lrf_max', 'Locked rotor recovery factor'],
    ['opf_min', 'opf_max', 'Output phase failure recovery'],
    ['cif_min', 'cif_max', 'Current imbalance recovery factor'],
    ['drf_min', 'drf_max', 'Dry run recovery'],
    ['lrr_min', 'lrr_max', 'Inrush current recovery'],
    ['olr_min', 'olr_max', 'Overload recovery time'],
    ['cir_min', 'cir_max', 'Current imbalance recovery time'],
    // ATMEL Calibrations
    ['ug_r_min', 'ug_r_max', 'Voltage gain R'],
    ['ug_y_min', 'ug_y_max', 'Voltage gain Y'],
    ['ug_b_min', 'ug_b_max', 'Voltage gain B'],
    ['ip_r_min', 'ip_r_max', 'Current gain R'],
    ['ip_y_min', 'ip_y_max', 'Current gain Y'],
    ['ip_b_min', 'ip_b_max', 'Current gain B'],
    // ADC Calibrations
    ['vg_r_min', 'vg_r_max', 'Voltage gain R (ADC)'],
    ['vg_y_min', 'vg_y_max', 'Voltage gain Y (ADC)'],
    ['vg_b_min', 'vg_b_max', 'Voltage gain B (ADC)'],
    ['vo_r_min', 'vo_r_max', 'Voltage offset R (ADC)'],
    ['vo_y_min', 'vo_y_max', 'Voltage offset Y (ADC)'],
    ['vo_b_min', 'vo_b_max', 'Voltage offset B (ADC)'],
    ['ig_r_min', 'ig_r_max', 'Current gain R (ADC)'],
    ['ig_y_min', 'ig_y_max', 'Current gain Y (ADC)'],
    ['ig_b_min', 'ig_b_max', 'Current gain B (ADC)'],
    ['io_r_min', 'io_r_max', 'Current offset R (ADC)'],
    ['io_y_min', 'io_y_max', 'Current offset Y (ADC)'],
    ['io_b_min', 'io_b_max', 'Current offset B (ADC)'],
];
/**
 * Create partial schema first (all fields optional)
 */
const partialSchema = v.partial(baseSchema);
/**
 * Apply min/max relationship validation
 * Ensures that max value is always >= min value for each pair
 */
export const vUpdateDefaultSettingsLimits = v.pipe(partialSchema, v.check((data) => {
    // Validate all min/max pairs
    for (const [minField, maxField, displayName] of minMaxPairs) {
        const minValue = data[minField];
        const maxValue = data[maxField];
        // Only validate if both values are present
        if (minValue !== undefined && maxValue !== undefined) {
            if (maxValue < minValue) {
                throw new Error(`${displayName}: maximum value (${maxValue}) cannot be less than minimum value (${minValue})`);
            }
        }
    }
    return true;
}, 'Min/Max relationship validation: max cannot be less than min'));
