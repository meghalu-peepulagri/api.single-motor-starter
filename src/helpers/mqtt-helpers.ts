import { DEVICE_SCHEMA } from "../constants/app-constants.js";
import { saveLiveDataTopic } from "../services/db/mqtt-db-services.js";
import { getStarterByMacWithMotor } from "../services/db/starter-services.js";
import type { RetryOptions } from "../types/app-types.js";
import { logger } from "../utils/logger.js";
import { validateLiveDataContent, validateLiveDataFormat } from "./live-topic-helpers.js";
import { prepareLiveDataPayload } from "./prepare-live-data-payload-helper.js";


export async function liveDataHandler(parsedMessage: any, topic: string) {
  try {
    if (!parsedMessage) return;
    const mac = typeof topic === "string" && topic.includes("/") ? topic.split("/")[1] : null;
    if (!mac) {
      logger.error("Invalid MQTT topic or missing MAC", undefined, { mac, topic });
      return null;
    }

    // Validate MAC in DB
    const validMac = await getStarterByMacWithMotor(mac);
    if (!validMac) {
      logger.error("Starter not found for MAC", undefined, { mac, topic });
      return null;
    }

    // Format raw payload 
    const formatted = validateLiveDataFormat(parsedMessage, topic);
    if (!formatted) return null;

    // Validate live data content 
    const validated = validateLiveDataContent(formatted);
    if (!validated) return null;

    //  Prepare payload for DB 
    const prepared = prepareLiveDataPayload(validated, validMac);
    if (!prepared) return null;

    // Save final payload
    await saveLiveDataTopic(prepared, prepared.group_id, validMac);
  }
  catch (err: any) {
    logger.error("Error at live data topic handler", err);
    return null;
  }
}


export function randomSequenceNumber() {
  let lastNumber: number | null = null;

  let random: number = 0;

  do {
    random = Math.floor(Math.random() * 256) + 1; // 1 to 256
  } while (random === lastNumber);

  lastNumber = random;
  return random;
};


export function removeEmptyObjectsDeep(obj: any): any {
  if (obj === null || typeof obj !== "object") return obj;

  const result: any = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    const value = removeEmptyObjectsDeep(obj[key]);

    if (
      value === undefined ||
      (typeof value === "object" &&
        value !== null &&
        Object.keys(value).length === 0)
    ) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

export function isEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function hasAnyChange(a: any, b: any): boolean {
  if (a === b) return false;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return true;
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b);

  for (const key in b) {
    if (!(key in a)) return true;
    const av = a[key];
    const bv = b[key];
    if (av === bv) continue;
    if (typeof av === "object" && typeof bv === "object") {
      if (hasAnyChange(av, bv)) return true;
    } else {
      return true;
    }
  }

  return false;
}

export function mapFlatToCategoryPayload(
  flatData: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const categoryKey of Object.keys(DEVICE_SCHEMA) as Array<
    keyof typeof DEVICE_SCHEMA
  >) {
    const categorySchema = DEVICE_SCHEMA[categoryKey];
    const categoryData: Record<string, any> = {};

    for (const [fieldKey, fieldMap] of Object.entries(categorySchema)) {
      if (typeof fieldMap === "string") {
        if (flatData[fieldMap] !== undefined) {
          categoryData[fieldKey] = flatData[fieldMap];
        }
      } else {
        // nested object (flt, alt, rec...)
        const nestedObj: Record<string, any> = {};
        for (const nestedKey of Object.keys(fieldMap)) {
          if (flatData[nestedKey] !== undefined) {
            nestedObj[nestedKey] = flatData[nestedKey];
          }
        }
        if (Object.keys(nestedObj).length > 0) {
          categoryData[fieldKey] = nestedObj;
        }
      }
    }

    if (Object.keys(categoryData).length > 0) {
      result[categoryKey] = categoryData;
    }
  }

  return result;
}


export function buildCategoryPayloadFromFlat(
  oldData: Record<string, any>,
  newData: Record<string, any>,
  DEVICE_SCHEMA: Record<string, any>
) {
  const payload: Record<string, any> = {};

  const buildFullCategory = (map: any): any => {
    const result: any = {};

    for (const key in map) {
      const mappedKey = map[key];

      if (typeof mappedKey === "string") {
        // take updated value if exists, else old value
        if (newData[mappedKey] !== undefined) {
          result[key] = newData[mappedKey];
        } else {
          result[key] = oldData[mappedKey];
        }
      } else {
        // nested object
        result[key] = buildFullCategory(mappedKey);
      }
    }

    return result;
  };

  const detectChange = (map: any): boolean => {
    for (const key in map) {
      const mappedKey = map[key];

      if (typeof mappedKey === "string") {
        if (
          newData[mappedKey] !== undefined &&
          !isEqual(newData[mappedKey], oldData[mappedKey])
        ) {
          return true;
        }
      } else {
        if (detectChange(mappedKey)) {
          return true;
        }
      }
    }
    return false;
  };

  for (const category in DEVICE_SCHEMA) {
    const categoryMap = DEVICE_SCHEMA[category];

    // if ANY field inside category changed
    if (detectChange(categoryMap)) {
      payload[category] = buildFullCategory(categoryMap);
    }
  }

  return payload;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const publishWithRetry = async (
  publishFn: () => Promise<void>,
  options: RetryOptions
): Promise<{ success: boolean; attempts: number }> => {
  const { attempts, delaysBeforeSendMs, ackTimeoutsMs } = options;

  // Validate retry options
  if (
    delaysBeforeSendMs.length !== attempts ||
    ackTimeoutsMs.length !== attempts
  ) {
    throw new Error(
      "Retry options arrays must match the number of attempts"
    );
  }

  let lastError: any = null;

  for (let i = 0; i < attempts; i++) {
    const attemptNumber = i + 1;

    try {
      // Delay before publish (skip if 0)
      if (delaysBeforeSendMs[i] > 0) {
        logger.mqtt(`Waiting ${delaysBeforeSendMs[i]}ms before attempt ${attemptNumber}`);
        await sleep(delaysBeforeSendMs[i]);
      }

      logger.mqtt(`Publishing attempt ${attemptNumber}/${attempts}`);

      // Publish message
      await publishFn();

      // If we reach here, publish succeeded
      logger.mqtt(`Publish attempt ${attemptNumber} succeeded`);
      return { success: true, attempts: attemptNumber };

    } catch (error) {
      lastError = error;
      logger.error(`Publish attempt ${attemptNumber}/${attempts} failed`, error);

      // If this is not the last attempt, continue to retry
      if (i < attempts - 1) {
        logger.mqtt(`Will retry... (${attempts - attemptNumber} attempts remaining)`);
      }
    }
  }

  // All retries exhausted
  logger.error(`All ${attempts} publish attempts failed`, lastError);
  return { success: false, attempts };
};