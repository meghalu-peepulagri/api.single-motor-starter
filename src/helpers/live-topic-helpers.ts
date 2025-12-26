import type { ValidationOutput } from "../types/app-types.js";
import { validateAndExtractLiveData } from "./payload-validate-helpers.js";

export function validateLiveDataFormat(payload: any, topic: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    console.error(`Invalid payload [${topic}]`);
    return null;
  }

  const d = payload.D;
  if (!d || typeof d !== "object" || Array.isArray(d)) {
    console.error(`Invalid or missing 'D' field [${topic}]`);
    return null;
  }

  const validGroups = ["G01", "G02", "G03", "G04"] as const;
  const matched: Partial<Record<typeof validGroups[number], any>> = {};

  for (const key of validGroups) {
    if (key in d && d[key] != null && typeof d[key] === "object") {
      matched[key] = d[key];
    }
  }

  if (Object.keys(matched).length === 0) {
    console.error(`No valid group found in payload [${topic}]`);
    return null;
  }

  return {
    original: payload,
    groups: matched,
  };
}

export function validateLiveDataContent(input: any): ValidationOutput | null {
  if (!input || typeof input !== "object") return null;

  // Fast path: input.original carries the real payload
  const orig = input.original;
  if (orig && (orig.T != null || orig.S != null || orig.D != null)) {
    return finalize(orig);
  }

  // Fast path: input itself is the full payload
  if (input.T != null || input.S != null || input.D != null) {
    return finalize(input);
  }

  // Group-only object (G01..G04) -> wrap into expected structure
  const groupKey = findGroupKey(input);
  if (groupKey) {
    const wrapped = { T: null, S: null, D: { [groupKey]: input[groupKey], ct: null } };
    return finalize(wrapped);
  }

  return null;

  function findGroupKey(obj: Record<string, any>): string | null {
    const valid = new Set(["G01", "G02", "G03", "G04"]);
    for (const k of Object.keys(obj)) {
      if (valid.has(k)) return k;
    }
    return null;
  }

  function finalize(fullPayload: any): ValidationOutput | null {
    const result = validateAndExtractLiveData(fullPayload);
    if (!result) return null;

    if (!result.group) {
      console.error("[validateLiveDataContent] Missing group after validation");
      return null;
    }

    return {
      validated_payload: !!result.validated_payload,
      data: result.data,
      group: result.group ?? null,
      errors: Array.isArray(result.errors) ? result.errors : [],
      T: result.T ?? null,
      S: result.S ?? null,
      ct: result.ct ?? null,
    };
  }
}