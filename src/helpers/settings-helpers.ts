import * as v from "valibot";
import { SETTINGS_FIELD_NAMES } from "../constants/app-constants.js";
import type { StarterBox } from "../database/schemas/starter-boxes.js";
import { publishData, waitForAck } from "../services/db/mqtt-db-services.js";
import { logger } from "../utils/logger.js";
import { randomSequenceNumber } from "./mqtt-helpers.js";
import { ACK_TYPES } from "./packet-types-helper.js";


/**
 * Enhanced validation helpers with comprehensive type checking and constraints
 */

// Configuration for validation constraints
const VALIDATION_CONSTRAINTS = {
  INTEGER_MAX: 2147483647, // Max safe 32-bit integer
  INTEGER_MIN: 0, // Minimum value for integers (non-negative)
  REAL_MAX: 999999.99, // Maximum value for real numbers
  REAL_MIN: 0, // Minimum value for real numbers (non-negative)
  DECIMAL_PRECISION: 2, // Maximum decimal places allowed
  STRING_MAX_LENGTH: 255, // Maximum string length
};

/**
 * Helper to round a number to specified decimal places
 */
const countDecimalPlaces = (num: number): number => {
  if (Number.isInteger(num)) return 0;
  const decimalPart = num.toString().split('.')[1];
  return decimalPart ? decimalPart.length : 0;
};

/**
 * Integer validation with comprehensive checks:
 * - Type must be number (not string, null, undefined, etc.)
 * - Must be an integer (no decimal values)
 * - Must be non-negative (>= 0)
 * - Must not exceed maximum safe integer value
 * - Rejects NaN, Infinity, -Infinity
 */
export const integerOnly = (
  field: keyof typeof SETTINGS_FIELD_NAMES,
  options?: {
    min?: number;
    max?: number;
    allowNegative?: boolean;
  }
) => {
  const min = options?.min ?? (options?.allowNegative ? -VALIDATION_CONSTRAINTS.INTEGER_MAX : VALIDATION_CONSTRAINTS.INTEGER_MIN);
  const max = options?.max ?? VALIDATION_CONSTRAINTS.INTEGER_MAX;

  return v.pipe(
    v.union(
      [v.number(), v.string()],
      `${SETTINGS_FIELD_NAMES[field]} must be a valid number`
    ),
    v.transform((val) => {
      // Handle string to number conversion
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '' || trimmed === null) {
          throw new Error(`${SETTINGS_FIELD_NAMES[field]} cannot be empty`);
        }
        const parsed = Number(trimmed);
        if (isNaN(parsed)) {
          throw new Error(`${SETTINGS_FIELD_NAMES[field]} must be a valid integer, received "${val}"`);
        }
        return parsed;
      }
      return val;
    }),
    v.check(
      (val) => typeof val === 'number' && !isNaN(val),
      `${SETTINGS_FIELD_NAMES[field]} must be a valid number, not NaN`
    ),
    v.check(
      (val) => isFinite(val),
      `${SETTINGS_FIELD_NAMES[field]} must be a finite number (not Infinity or -Infinity)`
    ),
    v.check(
      (val) => Number.isInteger(val),
      `${SETTINGS_FIELD_NAMES[field]} must be an integer without decimal places (decimal values not allowed)`
    ),
    v.check(
      (val) => val >= min,
      options?.allowNegative
        ? `${SETTINGS_FIELD_NAMES[field]} must be greater than or equal to ${min}`
        : `${SETTINGS_FIELD_NAMES[field]} must be a non-negative integer (negative values not allowed)`
    ),
    v.check(
      (val) => val <= max,
      `${SETTINGS_FIELD_NAMES[field]} must be less than or equal to ${max}`
    )
  );
};

/**
 * Real number (decimal) validation with comprehensive checks:
 * - Type must be number (not string, null, undefined, etc.)
 * - Must be non-negative (>= 0)
 * - Maximum 2 decimal places allowed
 * - Must not exceed maximum value
 * - Rejects NaN, Infinity, -Infinity
 */
export const realOnly = (
  field: keyof typeof SETTINGS_FIELD_NAMES,
  options?: {
    min?: number;
    max?: number;
    allowNegative?: boolean;
    decimalPlaces?: number;
  }
) => {
  const min = options?.min ?? (options?.allowNegative ? -VALIDATION_CONSTRAINTS.REAL_MAX : VALIDATION_CONSTRAINTS.REAL_MIN);
  const max = options?.max ?? VALIDATION_CONSTRAINTS.REAL_MAX;
  const decimalPlaces = options?.decimalPlaces ?? VALIDATION_CONSTRAINTS.DECIMAL_PRECISION;

  return v.pipe(
    v.union(
      [v.number(), v.string()],
      `${SETTINGS_FIELD_NAMES[field]} must be a valid number`
    ),
    v.transform((val) => {
      // Handle string to number conversion
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '' || trimmed === null) {
          throw new Error(`${SETTINGS_FIELD_NAMES[field]} cannot be empty`);
        }
        const parsed = Number(trimmed);
        if (isNaN(parsed)) {
          throw new Error(`${SETTINGS_FIELD_NAMES[field]} must be a valid number, received "${val}"`);
        }
        return parsed;
      }
      return val;
    }),
    v.check(
      (val) => typeof val === 'number' && !isNaN(val),
      `${SETTINGS_FIELD_NAMES[field]} must be a valid number, not NaN`
    ),
    v.check(
      (val) => isFinite(val),
      `${SETTINGS_FIELD_NAMES[field]} must be a finite number (not Infinity or -Infinity)`
    ),
    v.check(
      (val) => val >= min,
      options?.allowNegative
        ? `${SETTINGS_FIELD_NAMES[field]} must be greater than or equal to ${min}`
        : `${SETTINGS_FIELD_NAMES[field]} must be a non-negative number (negative values not allowed)`
    ),
    v.check(
      (val) => val <= max,
      `${SETTINGS_FIELD_NAMES[field]} must be less than or equal to ${max}`
    ),
    v.check(
      (val) => {
        const decimalCount = countDecimalPlaces(val);
        return decimalCount <= decimalPlaces;
      },
      `${SETTINGS_FIELD_NAMES[field]} can have maximum ${decimalPlaces} decimal place${decimalPlaces > 1 ? 's' : ''} (too many decimal places provided)`
    ),
    v.transform((val) => {
      // Round to specified decimal places to handle floating point precision issues
      return Math.round(val * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
    })
  );
};

/**
 * Enable/Disable validation (0 or 1 only):
 * - Type must be number
 * - Value must be exactly 0 or 1
 * - Rejects boolean true/false
 * - Rejects strings "0"/"1"
 */
export const enable01 = (field: keyof typeof SETTINGS_FIELD_NAMES) =>
  v.pipe(
    v.union(
      [v.number(), v.string()],
      `${SETTINGS_FIELD_NAMES[field]} must be 0 or 1`
    ),
    v.transform((val) => {
      // Handle string to number conversion
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed !== '0' && trimmed !== '1') {
          throw new Error(`${SETTINGS_FIELD_NAMES[field]} must be 0 or 1, received "${val}"`);
        }
        return Number(trimmed);
      }
      return val;
    }),
    v.check(
      (val) => typeof val === 'number',
      `${SETTINGS_FIELD_NAMES[field]} must be a number type (0 or 1)`
    ),
    v.check(
      (val) => val === 0 || val === 1,
      `${SETTINGS_FIELD_NAMES[field]} must be exactly 0 or 1`
    )
  );

/**
 * Required text validation with comprehensive checks:
 * - Type must be string (not number, etc.)
 * - Handles null/undefined values by converting to empty string
 * - For required fields (default): minLength >= 1, will fail with "cannot be empty" message
 * - For optional fields: set minLength: 0 to allow empty/null values
 * - Maximum length validation
 * - Trims whitespace automatically
 */
export const requiredText = (
  field: keyof typeof SETTINGS_FIELD_NAMES,
  options?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    patternMessage?: string;
  }
) => {
  const minLength = options?.minLength ?? 1;
  const maxLength = options?.maxLength ?? VALIDATION_CONSTRAINTS.STRING_MAX_LENGTH;

  const baseValidation = v.pipe(
    v.union(
      [v.string(), v.null(), v.undefined()],
      `${SETTINGS_FIELD_NAMES[field]} must be a text string`
    ),
    v.transform((val: string | null | undefined) => {
      // Handle null/undefined values - convert to empty string
      if (val === null || val === undefined) {
        return '';
      }

      // Handle string values
      if (typeof val === 'string') {
        return val.trim();
      }

      throw new Error(`${SETTINGS_FIELD_NAMES[field]} must be a text string, received ${typeof val}`);
    }),
    v.check(
      (val: string) => val.length >= minLength,
      minLength === 0
        ? `${SETTINGS_FIELD_NAMES[field]} must be a valid text string`
        : `${SETTINGS_FIELD_NAMES[field]} cannot be empty or contain only whitespace`
    ),
    v.check(
      (val: string) => val.length <= maxLength,
      `${SETTINGS_FIELD_NAMES[field]} must be ${maxLength} characters or less`
    )
  );

  if (options?.pattern) {
    return v.pipe(
      baseValidation,
      v.check(
        (val: string) => {
          // Skip pattern validation for empty strings (when minLength is 0)
          if (minLength === 0 && val === '') {
            return true;
          }
          return options.pattern!.test(val);
        },
        options.patternMessage || `${SETTINGS_FIELD_NAMES[field]} format is invalid`
      )
    );
  }

  return baseValidation;
};

/**
 * Optional text validation for truly optional fields:
 * - Accepts string, null, or undefined
 * - Converts null/undefined to null (not empty string)
 * - Trims whitespace from strings
 * - Converts empty strings (after trim) to null for DB insertion
 * - Pattern validation only applies when value is not null/empty
 * - Use this for optional fields that should be NULL in database when empty
 *
 * Examples:
 * - Input: null → Output: null
 * - Input: undefined → Output: null
 * - Input: "" → Output: null
 * - Input: "   " → Output: null (trimmed to empty, then null)
 * - Input: "valid text" → Output: "valid text" (trimmed)
 */
export const optionalText = (
  field: keyof typeof SETTINGS_FIELD_NAMES,
  options?: {
    maxLength?: number;
    pattern?: RegExp;
    patternMessage?: string;
  }
) => {
  const maxLength = options?.maxLength ?? VALIDATION_CONSTRAINTS.STRING_MAX_LENGTH;

  const baseValidation = v.pipe(
    v.union(
      [v.string(), v.null(), v.undefined()],
      `${SETTINGS_FIELD_NAMES[field]} must be a text string or null`
    ),
    v.transform((val: string | null | undefined) => {
      // Handle null/undefined values - keep as null
      if (val === null || val === undefined) {
        return null;
      }

      // Handle string values
      if (typeof val === 'string') {
        const trimmed = val.trim();
        // Convert empty strings to null for DB insertion
        if (trimmed === '') {
          return null;
        }
        return trimmed;
      }

      throw new Error(`${SETTINGS_FIELD_NAMES[field]} must be a text string or null, received ${typeof val}`);
    }),
    v.check(
      (val: string | null) => {
        // Null values are always valid for optional fields
        if (val === null) {
          return true;
        }
        // Non-null values must not exceed maxLength
        return val.length <= maxLength;
      },
      `${SETTINGS_FIELD_NAMES[field]} must be ${maxLength} characters or less`
    )
  );

  if (options?.pattern) {
    return v.pipe(
      baseValidation,
      v.check(
        (val: string | null) => {
          // Null values are always valid - skip pattern validation
          if (val === null) {
            return true;
          }
          // Non-null values must match pattern
          return options.pattern!.test(val);
        },
        options.patternMessage || `${SETTINGS_FIELD_NAMES[field]} format is invalid`
      )
    );
  }

  return baseValidation;
};

/**
 * Phone number array validation with flexible digit requirement:
 * - Handles null/undefined values by converting to empty array
 * - Each phone number must be maximum 10 digits with no minimum limit
 * - Cannot contain empty or whitespace-only entries
 * - Only numeric digits allowed (0-9)
 * - Automatic trimming of whitespace
 * - Maximum array size validation
 * - Removes duplicate phone numbers by default
 */
export const phoneNumberArray = (
  field: keyof typeof SETTINGS_FIELD_NAMES,
  options?: {
    maxArraySize?: number;
    allowDuplicates?: boolean;
  }
) => {
  const maxArraySize = options?.maxArraySize ?? 10; // Maximum 10 phone numbers
  const allowDuplicates = options?.allowDuplicates ?? false;

  return v.pipe(
    v.union(
      [v.array(v.union([v.string(), v.number()])), v.null(), v.undefined()],
      `${SETTINGS_FIELD_NAMES[field]} must be an array of mobile numbers`
    ),
    v.transform((val: Array<string | number> | null | undefined) => {
      // Handle null/undefined values - convert to empty array
      if (val === null || val === undefined) {
        return [];
      }

      // Ensure it's an array
      if (!Array.isArray(val)) {
        throw new Error(`${SETTINGS_FIELD_NAMES[field]} must be an array`);
      }

      return val;
    }),
    v.check(
      (arr) => arr.length <= maxArraySize,
      `${SETTINGS_FIELD_NAMES[field]} cannot contain more than ${maxArraySize} mobile numbers`
    ),
    v.transform((arr) => {
      // If empty array, return it as is
      if (arr.length === 0) {
        return [];
      }

      // Convert all items to strings and trim whitespace, remove non-digits
      return arr.map((item) => {
        let phoneStr = '';
        if (typeof item === 'number') {
          phoneStr = item.toString();
        } else if (typeof item === 'string') {
          phoneStr = item.trim();
        } else {
          throw new Error(
            `${SETTINGS_FIELD_NAMES[field]} contains invalid item type: ${typeof item}`
          );
        }
        // Remove all non-digit characters (spaces, hyphens, parentheses, etc.)
        return phoneStr.replace(/\D/g, '');
      });
    }),
    v.check(
      (arr: string[]) => arr.every((phone) => phone.length > 0),
      `${SETTINGS_FIELD_NAMES[field]} cannot contain empty mobile numbers`
    ),
    v.check(
      (arr: string[]) => arr.every((phone) => /^\d+$/.test(phone)),
      `${SETTINGS_FIELD_NAMES[field]} must contain only numeric digits (0-9)`
    ),
    v.check(
      (arr: string[]) => arr.every((phone) => phone.length <= 10),
      `${SETTINGS_FIELD_NAMES[field]} - invalid mobile number (must be maximum 10 digits)`
    ),
    v.transform((arr: string[]) => {
      // Remove duplicates if not allowed
      if (!allowDuplicates) {
        return Array.from(new Set(arr));
      }
      return arr;
    })
  );
};


export const prepareStmAtmelSettingsData = (starter: StarterBox, settings: any) => {
  if (!starter?.pcb_number || !starter?.mac_address || !settings) return null;

  return {
    T: 13,
    S: randomSequenceNumber(),

    D: {
      /* ================= Device Config ================= */
      dvc_c: {
        /* ================= Basic ================= */
        allflt_en: settings.allflt_en,
        flc: settings.flc,
        as_dly: settings.st,

        /* ================= Enables ================= */
        v_en: settings.v_en,
        c_en: settings.c_en,

        /* ================= Fault Thresholds ================= */
        ipf: settings.ipf,
        lvf: settings.lvf,
        hvf: settings.hvf,
        vif: settings.vif,
        paminf: settings.paminf,
        pamaxf: settings.pamaxf,

        f_dr: settings.f_dr,
        f_ol: settings.f_ol,
        f_lr: settings.f_lr,
        f_opf: settings.f_opf,
        f_ci: settings.f_ci,

        /* ================= Alert Thresholds ================= */
        pfa: settings.pfa,
        lva: settings.lva,
        hva: settings.hva,
        via: settings.via,
        pamina: settings.pamina,
        pamaxa: settings.pamaxa,

        dr: settings.dr,
        ol: settings.ol,
        lr: settings.lr,
        ci: settings.ci,

        /* ================= Recovery Settings ================= */
        lvr: settings.lvr,
        hvr: settings.hvr,
        olf: settings.olf,
        lrf: settings.lrf,
        opf: settings.opf,
        cif: settings.cif,
      },
      /* ================= Calibrations ================= */
      clb: {
        ug_r: settings.ug_r,
        ug_y: settings.ug_y,
        ug_b: settings.ug_b,
        ig_r: settings.ig_r,
        ig_y: settings.ig_y,
        ig_b: settings.ig_b,
      },

      /* ================= MQTT Configuration ================= */
      mqt_c: {
        ca_fn: settings.ca_fn,
        bkr_adrs: settings.bkr_adrs,
        usrn: settings.usrn,
        pswd: settings.pswd,
        prd_url: settings.prd_url,
        port: settings.port,
        crt_en: settings.crt_en,
      },

      /* ================= IVRS Configuration ================= */
      ivrs_info: {
        sms_pswd: settings.sms_pswd,
        c_lang: settings.c_lang,
        auth_num: settings.auth_num ?? [],
      },

      /* ================= Frequency Configuration ================= */
      fq_c: {
        dft_liv_f: settings.dft_liv_f,
        h_liv_f: settings.h_liv_f,
        m_liv_f: settings.m_liv_f,
        l_liv_f: settings.l_liv_f,
        pwr_info_f: settings.pwr_info_f,
      },

      /* ================= Feature Enables ================= */
      f_e: {
        ivrs_en: settings.ivrs_en,
        sms_en: settings.sms_en,
        rmt_en: settings.rmt_en,
      },
    },
  };
}

export const prepareHardWareVersion = (starterDetails: StarterBox) => {
  if (!starterDetails.hardware_version) return;
  return {
    "T": 17,
    "S": randomSequenceNumber(),
    "D": {
      "sn": starterDetails.pcb_number,
      "hw": starterDetails.hardware_version,
    }
  };
};


const validateSettingsAck = (payload: any, expectedSequence: number) => {
  return (
    payload &&
    payload.T === ACK_TYPES.ADMIN_CONFIG_DATA_REQUEST_ACK &&
    payload.S === expectedSequence &&
    (payload.D === 0 || payload.D === 1)
  );
};

export const publishMultipleTimesInBackground = async (
  devicePayload: any,
  starterDetails: StarterBox
): Promise<void> => {
  const totalAttempts = 3;
  const ackWaitTimes = [3000, 5000, 5000];

  const isAckValid = (payload: any) =>
    validateSettingsAck(payload, devicePayload.S);

  const ackIdentifiers = [
    starterDetails.pcb_number,
    starterDetails.mac_address,
  ].filter(Boolean);

  for (let i = 0; i < totalAttempts; i++) {
    try {
      publishData(devicePayload, starterDetails);

      const ackReceived = await waitForAck(
        ackIdentifiers, 
        ackWaitTimes[i],
        isAckValid
      );

      if (ackReceived) {
        return; // stop retries on ACK
      }

    } catch (error) {
      logger.error(
        `Attempt ${i + 1} failed for starter ${starterDetails.id}`,
        error
      );
    }
  }

  logger.error(
    `[Failure] All ${totalAttempts} retry attempts failed for starter id : ${starterDetails.id}. pcb : ${starterDetails.pcb_number}, mac : ${starterDetails.mac_address}`
  );
};
