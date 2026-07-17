import * as v from "valibot";
import { MOTOR_ID_REQUIRED, MOTORS_ARRAY_REQUIRED } from "../../constants/app-constants.js";
import { enable01, integerOnly, realOnly } from "../../helpers/settings-helpers.js";
import { requiredNumber } from "./common-validations.js";

// Per-motor block — current is measured per motor branch, so these fields vary per
// motor rather than per box (mirrors the field-level validators default-settings.ts
// already uses for the equivalent single-motor fields).
const vMotorSettingsEntry = v.object({
  // motor_id optional — the grouped payload identifies motors by motor_reference (m1/m2).
  motor_id: v.optional(requiredNumber(MOTOR_ID_REQUIRED)),
  motor_reference: v.optional(v.string()),

  // All per-motor fields optional — the grouped device payload sends only a subset.
  flt_en: v.optional(integerOnly("flt_en")),
  flc: v.optional(realOnly("flc")),
  f_dr: v.optional(realOnly("f_dr")),
  f_ol: v.optional(realOnly("f_ol")),
  f_lr: v.optional(realOnly("f_lr")),
  f_opf: v.optional(realOnly("f_opf")),
  f_ci: v.optional(realOnly("f_ci")),
  dr: v.optional(realOnly("dr")),
  ol: v.optional(realOnly("ol")),
  lr: v.optional(realOnly("lr")),
  ci: v.optional(realOnly("ci")),
  drf: v.optional(realOnly("drf")),
  olf: v.optional(realOnly("olf")),
  lrf: v.optional(realOnly("lrf")),
  opf: v.optional(realOnly("opf")),
  cif: v.optional(realOnly("cif")),
  olr: v.optional(realOnly("olr")),
  lrr: v.optional(realOnly("lrr")),
  cir: v.optional(realOnly("cir")),
  ig_r: v.optional(realOnly("ig_r", { decimalPlaces: 5 })),
  ig_y: v.optional(realOnly("ig_y", { decimalPlaces: 5 })),
  ig_b: v.optional(realOnly("ig_b", { decimalPlaces: 5 })),
  io_r: v.optional(realOnly("io_r")),
  io_y: v.optional(realOnly("io_y")),
  io_b: v.optional(realOnly("io_b")),
});

// Shared (box-level) fields new to multi-motor boxes, validated on their own so the
// existing single-motor vUpdateDefaultSettings schema never needs editing.
export const vUpdateMultiMotorSettings = v.object({
  // Optional — a diff payload may omit box-level fields when only per-motor values changed.
  v_flt_en: v.optional(integerOnly("v_flt_en")),
  sd_time: v.optional(integerOnly("sd_time")),

  motors: v.pipe(
    v.array(vMotorSettingsEntry),
    v.minLength(1, MOTORS_ARRAY_REQUIRED),
    v.maxLength(2, "A device supports at most 2 motors"),
  ),
});

export type ValidatedUpdateMultiMotorSettings = v.InferOutput<typeof vUpdateMultiMotorSettings>;
export type ValidatedMotorSettingsEntry = v.InferOutput<typeof vMotorSettingsEntry>;
