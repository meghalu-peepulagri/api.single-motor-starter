import * as v from "valibot";
import { SETTINGS_FIELD_NAMES } from "../constants/app-constants.js";

// Integer only helper
export const integerOnly = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`),
    v.check(
      (val) => Number.isInteger(val),
      `${SETTINGS_FIELD_NAMES[field]} expects an integer but received a decimal`
    )
  );

// Real (number) helper
export const realOnly = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`),
    v.check(
      (val) => typeof val === "number",
      `${SETTINGS_FIELD_NAMES[field]} expects a real number`
    )
  );

// 0/1 helper
export const enable01 = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.number(`${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`),
    v.check(
      (val: number) => val === 0 || val === 1,
      `${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`
    )
  );
// Required text helper
export const requiredText = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.string(`${SETTINGS_FIELD_NAMES[field]} is required`);