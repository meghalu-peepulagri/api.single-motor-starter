// src/validators/liveDataValidator.ts
// FINAL VERSION – p_v is NUMBER, everything strict & clean

const isNumber = (v: any): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isNumeric = (v: any): boolean => {
  if (v == null) return false;
  const n = Number(v);
  return !isNaN(n) && String(n) === String(v).trim();
};

export const cleanScalar = (value: any): number | null => {
  if (isNumber(value)) return value;
  if (isNumeric(value)) return Number(value);
  return null;
};

export const cleanThreeNumberArray = (arr: any): [number, number, number] => {
  if (!Array.isArray(arr)) return [0, 0, 0];

  const result: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const val = cleanScalar(arr[i]);
    result[i] = val !== null ? Math.round(val * 100) / 100 : 0;
  }
  return result;
};

// CONFIG — p_v is NUMBER, no stringKeys
const CONFIG = {
  G01: {
    required: ["p_v", "pwr", "mode", "llv", "m_s", "amp", "flt", "alt", "r_s", "l_on", "l_of"] as const,
    array3: ["llv", "amp"] as const,
  },
  G02: { required: ["pwr", "mode", "llv", "m_s", "amp"] as const, array3: ["llv", "amp"] as const },
  G03: { required: ["pwr", "llv", "m_s"] as const, array3: ["llv"] as const },
  G04: { required: ["pwr", "mode"] as const, array3: [] as const },
} as const;

type GroupKey = keyof typeof CONFIG;

export interface LiveDataResult {
  T: number | null;
  S: number | null;
  ct: string | null;
  group: GroupKey | null;
  data: Record<string, number | [number, number, number]>;
  errors: string[];
  validated_payload: boolean;
}

export function validateAndExtractLiveData(payload: any): LiveDataResult {
  const errors: string[] = [];

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("Invalid payload root");
    return { T: null, S: null, ct: null, group: null, data: {}, errors, validated_payload: false };
  }

  const { T, S, D } = payload;
  if (!D || typeof D !== "object") {
    errors.push("Missing 'D' field");
    return { T: null, S: null, ct: null, group: null, data: {}, errors, validated_payload: false };
  }

  const ct = typeof D.ct === "string" ? D.ct.trim() : null;

  const groupKey = Object.keys(CONFIG).find(
    (k): k is GroupKey => k in D && D[k] != null && typeof D[k] === "object"
  ) || null;

  const cleaned: Record<string, number | [number, number, number]> = {};

  if (!groupKey) {
    errors.push("No valid group found");
  } else {
    const groupData = D[groupKey];
    const config = CONFIG[groupKey];

    for (const key of config.required) {
      const raw = groupData[key];

      if (raw === undefined) {
        cleaned[key] = 0;
        errors.push(`Missing key: ${key}`);
        continue;
      }

      // Special: p_v — allow string like "1.9" → convert to number
      if (key === "p_v") {
        const num = cleanScalar(raw);
        if (num === null) {
          cleaned.p_v = 0;
          errors.push(`p_v invalid: expected number, got "${raw}" (${typeof raw})`);
        } else {
          cleaned.p_v = num;
          if (typeof raw === "string") {
            errors.push(`p_v warning: received string "${raw}", converted to number`);
          }
        }
        continue;
      }

      // Arrays
      if (config.array3.includes(key as never)) {
        if (!Array.isArray(raw)) {
          cleaned[key] = [0, 0, 0];
          errors.push(`${key} expected array, got ${typeof raw}`);
          continue;
        }
        const arr = cleanThreeNumberArray(raw);
        cleaned[key] = arr;

        raw.forEach((v: any, i: number) => {
          if (typeof v === "string") {
            errors.push(`${key}[${i}] expected number, got string "${v}"`);
          }
        });
        continue;
      }

      // All other fields — must be number
      const num = cleanScalar(raw);
      if (num === null) {
        cleaned[key] = 0;
        errors.push(`${key} invalid: expected number, got "${raw}" (${typeof raw})`);
      } else {
        cleaned[key] = num;
        if (typeof raw === "string") {
          errors.push(`${key} warning: received string "${raw}", converted to number`);
        }
      }
    }
  }

  return {
    T: typeof T === "number" ? T : null,
    S: typeof S === "number" ? S : null,
    ct,
    group: groupKey,
    data: cleaned,
    errors,
    validated_payload: errors.length === 0,
  };
}