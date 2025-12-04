import { validateG01, validateG02, validateG03, validateG04 } from "./payload-validate-helpers.js";

export function validateLiveDataFormat(payload: any, topic: string) {
  try {
    const validKeys = ["G01", "G02", "G03", "G04"];

    if (!payload || typeof payload !== "object") {
      console.error(`Invalid live data payload for topic Format [${topic}] :`, payload);
      return null;
    }

    const d = payload.D;

    if (!d || typeof d !== "object") {
      console.error(`Invalid 'D' field in live data topic Format [${topic}] :`, payload);
      return null;
    }

    const matchedGroups: any = {};
    validKeys.forEach(key => {
      if (key in d) { matchedGroups[key] = d[key] }
    });

    if (Object.keys(matchedGroups).length === 0) {
      console.error(`No valid group keys found in live data Format [${topic}] :`, payload);
      return null;
    }

    return {
      payload, matchedGroups
    }
  } catch (error: any) {
    console.error("Error in live Data Topic Helper Format:", error);
    throw error;
  }
}

export function validateLiveDataPayload(groupIdObj: any, payload: any) {
  try {
    if (!groupIdObj || typeof groupIdObj !== "object") {
      console.error("Invalid payload format");
      return null;
    }

    const groupId = Object.keys(groupIdObj)[0];
    const payload = groupIdObj[groupId];
    let validData;

    switch (groupId) {
      case "G01":
        validData = validateG01(payload);
        break;

      case "G02":
        validData = validateG02(payload);
        break;

      case "G03":
        validData = validateG03(payload);
        break;

      case "G04":
        validData = validateG04(payload);
        break;

      default:
        console.error("Invalid groupId received in live data payload:", groupIdObj);
        return null;
    }

    return validData;

  } catch (error) {
    console.error("Error in validate Live Data Payload:", error);
    throw error;
  }
}
