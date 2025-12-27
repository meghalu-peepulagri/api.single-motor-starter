const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isNumeric = (v) => {
    if (v == null)
        return false;
    const n = Number(v);
    return !isNaN(n) && String(n) === String(v).trim();
};
export const cleanScalar = (value) => {
    if (isNumber(value))
        return value;
    if (isNumeric(value))
        return Number(value);
    return null;
};
export const cleanThreeNumberArray = (arr) => {
    if (!Array.isArray(arr))
        return [0, 0, 0];
    const result = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
        const val = cleanScalar(arr[i]);
        result[i] = val !== null ? Math.round(val * 100) / 100 : 0;
    }
    return result;
};
function normalizeGroupData(groupData) {
    if (!groupData || typeof groupData !== "object")
        return groupData;
    return {
        ...groupData,
        llv: groupData.llv ?? groupData.ll_v,
        m_s: groupData.m_s ?? groupData.mtr_sts,
    };
}
const CONFIG = {
    G01: {
        required: ["p_v", "pwr", "mode", "llv", "m_s", "amp", "flt", "alt", "r_s", "l_on", "l_of"],
        array3: ["llv", "amp"],
    },
    G02: {
        required: ["pwr", "mode", "llv", "m_s", "amp"],
        array3: ["llv", "amp"],
    },
    G03: {
        required: ["pwr", "llv", "m_s"],
        array3: ["llv"],
    },
    G04: {
        required: ["pwr", "mode"],
        array3: [],
    },
};
export function validateAndExtractLiveData(payload) {
    const errors = [];
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        errors.push("Invalid payload root");
        return emptyResult(errors);
    }
    const { T, S, D } = payload;
    if (!D || typeof D !== "object") {
        errors.push("Missing 'D' field");
        return emptyResult(errors);
    }
    const ct = typeof D.ct === "string" ? D.ct.trim() : null;
    const groupKey = Object.keys(CONFIG).find((k) => k in D && D[k] && typeof D[k] === "object") || null;
    const cleaned = {};
    if (!groupKey) {
        errors.push("No valid group found");
    }
    else {
        // 🔥 NORMALIZATION HAPPENS HERE
        const groupData = normalizeGroupData(D[groupKey]);
        const config = CONFIG[groupKey];
        for (const key of config.required) {
            const raw = groupData[key];
            // Missing key
            if (raw === undefined) {
                cleaned[key] = key === "llv" || key === "amp" ? [0, 0, 0] : 0;
                errors.push(`Missing key: ${key}`);
                continue;
            }
            // p_v — special handling
            if (key === "p_v") {
                const num = cleanScalar(raw);
                if (num === null) {
                    cleaned.p_v = 0;
                    errors.push(`p_v invalid: expected number, got "${raw}"`);
                }
                else {
                    cleaned.p_v = num;
                }
                continue;
            }
            // 3-number arrays
            if (config.array3.includes(key)) {
                if (!Array.isArray(raw)) {
                    cleaned[key] = [0, 0, 0];
                    errors.push(`${key} expected array`);
                    continue;
                }
                cleaned[key] = cleanThreeNumberArray(raw);
                continue;
            }
            // Scalars
            const num = cleanScalar(raw);
            if (num === null) {
                cleaned[key] = 0;
                errors.push(`${key} invalid: expected number`);
            }
            else {
                cleaned[key] = num;
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
function emptyResult(errors) {
    return {
        T: null,
        S: null,
        ct: null,
        group: null,
        data: {},
        errors,
        validated_payload: false,
    };
}
