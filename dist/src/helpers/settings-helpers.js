import * as v from "valibot";
import { SETTINGS_FIELD_NAMES } from "../constants/app-constants.js";
// Integer only helper
export const integerOnly = (field) => v.pipe(v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`), v.check((val) => Number.isInteger(val), `${SETTINGS_FIELD_NAMES[field]} expects an integer but received a decimal`));
// Real (number) helper
export const realOnly = (field) => v.pipe(v.number(`${SETTINGS_FIELD_NAMES[field]} must be a number`), v.check((val) => typeof val === "number", `${SETTINGS_FIELD_NAMES[field]} expects a real number`));
// 0/1 helper
export const enable01 = (field) => v.pipe(v.number(`${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`), v.check((val) => val === 0 || val === 1, `${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`));
// Required text helper
export const requiredText = (field) => v.string(`${SETTINGS_FIELD_NAMES[field]} is required`);
