
export function isNumber(value: any): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

export function cleanThreeNumberArray(arr: any): [number, number, number] {
  const clean: [number, number, number] = [0, 0, 0];

  if (!Array.isArray(arr)) return clean;

  for (let i = 0; i < 3; i++) {
    const v = arr[i];
    clean[i] = isNumber(v) ? Math.round(v * 100) / 100 : 0;
  }

  return clean;
}


export function cleanScalar(value: any): number | null {
  return isNumber(value) ? value : null;
}

export function validateG01(data: any) {
  const result = {
    validated_payload: true,
    data: null as any
  };

  if (!data || typeof data !== "object") {
    return { validated_payload: false, data: null };
  }

  const requiredKeys = [
    "p_v", "pwr", "mode",
    "llv", "m_s", "amp",
    "flt", "alt", "r_s",
    "l_on", "l_of"
  ];

  // Check missing keys
  for (const key of requiredKeys) {
    if (!(key in data)) {
      result.validated_payload = false;
    }
  }

  // Clean arrays
  const cleaned_llv = cleanThreeNumberArray(data.llv);
  const cleaned_amp = cleanThreeNumberArray(data.amp);

  // Clean scalar values
  const cleanedData = {
    p_v: cleanScalar(data.p_v),
    pwr: cleanScalar(data.pwr),
    mode: cleanScalar(data.mode),
    llv: cleaned_llv,
    m_s: cleanScalar(data.m_s),
    amp: cleaned_amp,
    flt: cleanScalar(data.flt),
    alt: cleanScalar(data.alt),
    r_s: cleanScalar(data.r_s),
    l_on: cleanScalar(data.l_on),
    l_of: cleanScalar(data.l_of)
  };

  // If any scalar became null → mark invalid
  for (const key of Object.keys(cleanedData)) {
    const v = (cleanedData as any)[key];
    if (v === null) result.validated_payload = false;
  }

  result.data = cleanedData;
  return result;
}


export function validateG02(data: any) {
  const result = {
    validated_payload: true,
    data: null as any
  };

  if (!data || typeof data !== "object") {
    return { validated_payload: false, data: null };
  }

  const requiredKeys = [
    "pwr", "mode", "llv", "m_s", "amp"
  ];

  // Check missing keys
  for (const key of requiredKeys) {
    if (!(key in data)) {
      console.error(`Missing key in G02 payload: ${key}`);
      result.validated_payload = false;
    }
  }

  // Clean arrays
  const cleaned_llv = cleanThreeNumberArray(data.llv);
  const cleaned_amp = cleanThreeNumberArray(data.amp);

  // Clean scalar values
  const cleanedData = {
    pwr: cleanScalar(data.pwr),
    mode: cleanScalar(data.mode),
    llv: cleaned_llv,
    m_s: cleanScalar(data.m_s),
    amp: cleaned_amp
  };

  for (const key of Object.keys(cleanedData)) {
    const v = (cleanedData as any)[key];
    if (v === null) result.validated_payload = false;
  }

  result.data = cleanedData;
  return result;
}

export function validateG03(data: any) {
  const result = {
    validated_payload: true,
    data: null as any
  };

  if (!data || typeof data !== "object") {
    return { validated_payload: false, data: null };
  }

  const requiredKeys = [
    "pwr", "llv", "m_s"
  ];

  for (const key of requiredKeys) {
    if (!(key in data)) {
      console.error(`Missing key in G03 payload: ${key}`);
      result.validated_payload = false;
    }
  }

  const cleaned_llv = cleanThreeNumberArray(data.llv);

  const cleanedData = {
    pwr: cleanScalar(data.pwr),
    llv: cleaned_llv,
    m_s: cleanScalar(data.m_s)
  };

  for (const key of Object.keys(cleanedData)) {
    const v = (cleanedData as any)[key];
    if (v === null) result.validated_payload = false;
  }

  result.data = cleanedData;
  return result;
}

export function validateG04(data: any) {
  const result = {
    validated_payload: true,
    data: null as any
  };

  if (!data || typeof data !== "object") {
    return { validated_payload: false, data: null };
  }

  const requiredKeys = [
    "pwr", "mode"
  ];

  // Check for missing keys
  for (const key of requiredKeys) {
    if (!(key in data)) {
      console.error(`Missing key in G04 payload: ${key}`);
      result.validated_payload = false;
    }
  }

  // Clean scalar values
  const cleanedData = {
    pwr: cleanScalar(data.pwr),
    mode: cleanScalar(data.mode)
  };

  for (const key of Object.keys(cleanedData)) {
    const v = (cleanedData as any)[key];
    if (v === null) result.validated_payload = false;
  }

  result.data = cleanedData;
  return result;
}