import { validateAndExtractLiveData, type LiveDataResult } from "./payload-validate-helpers.js";

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

export function validateLiveDataContent(input: any): {
  validated_payload: boolean; data: any; group: string | null;
  errors: string[]; T: number | null; S: number | null; ct: string | null;
} | null {
  let fullPayload: any = null;

  if (input?.original && (input.original.T != null || input.original.S != null || input.original.D)) {
    fullPayload = input.original;
  }
  // Case 2: Raw full payload { T, S, D }
  else if (input && (input.T != null || input.S != null || input.D)) {
    fullPayload = input;
  }
  else if (input && typeof input === "object" && !Array.isArray(input)) {
    const groupKey = Object.keys(input).find(k => ["G01", "G02", "G03", "G04"].includes(k));

    if (!groupKey) {
      console.error("[validateLiveDataContent] FATAL: No valid group (G01-G04) found — dropping message entirely");
      return null;
    }

    fullPayload = { T: null, S: null, D: { [groupKey]: input[groupKey], ct: null } };
    console.error(`[validateLiveDataContent] Only group data received (missing T, S, ct) — wrapped for processing`);
  }
  else {
    console.error("[validateLiveDataContent] Invalid input format — cannot parse payload");
    return null;
  }

  //  validation
  const result: LiveDataResult = validateAndExtractLiveData(fullPayload);

  if (!result.group) {
    console.error("[validateLiveDataContent] CRITICAL: Group detection failed after wrapping — this should never happen");
  }

  return {
    validated_payload: result.validated_payload,
    data: result.data,
    group: result.group,
    errors: result.errors,
    T: result.T,
    S: result.S,
    ct: result.ct,
  };
}