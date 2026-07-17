import * as v from "valibot";
import { MOTOR_ID_REQUIRED, MOTORS_ARRAY_REQUIRED } from "../../constants/app-constants.js";
import { enable01, integerOnly, realOnly } from "../../helpers/settings-helpers.js";
import { requiredNumber } from "./common-validations.js";
// Per-motor block — current is measured per motor branch, so these fields vary per
// motor rather than per box (mirrors the field-level validators default-settings.ts
// already uses for the equivalent single-motor fields).
const vMotorSettingsEntry = v.object({
    motor_id: requiredNumber(MOTOR_ID_REQUIRED),
    motor_reference: v.optional(v.string()),
    flt_en: integerOnly("flt_en"),
    flc: realOnly("flc"),
    f_dr: realOnly("f_dr"),
    f_ol: realOnly("f_ol"),
    f_lr: realOnly("f_lr"),
    f_opf: realOnly("f_opf"),
    f_ci: realOnly("f_ci"),
    dr: realOnly("dr"),
    ol: realOnly("ol"),
    lr: realOnly("lr"),
    ci: realOnly("ci"),
    drf: realOnly("drf"),
    olf: realOnly("olf"),
    lrf: realOnly("lrf"),
    opf: realOnly("opf"),
    cif: realOnly("cif"),
    olr: realOnly("olr"),
    lrr: realOnly("lrr"),
    cir: realOnly("cir"),
    ig_r: realOnly("ig_r", { decimalPlaces: 5 }),
    ig_y: realOnly("ig_y", { decimalPlaces: 5 }),
    ig_b: realOnly("ig_b", { decimalPlaces: 5 }),
    io_r: realOnly("io_r"),
    io_y: realOnly("io_y"),
    io_b: realOnly("io_b"),
});
// Shared (box-level) fields new to multi-motor boxes, validated on their own so the
// existing single-motor vUpdateDefaultSettings schema never needs editing.
export const vUpdateMultiMotorSettings = v.object({
    v_flt_en: integerOnly("v_flt_en"),
    sd_time: integerOnly("sd_time"),
    motors: v.pipe(v.array(vMotorSettingsEntry), v.minLength(1, MOTORS_ARRAY_REQUIRED), v.maxLength(2, "A device supports at most 2 motors")),
});
