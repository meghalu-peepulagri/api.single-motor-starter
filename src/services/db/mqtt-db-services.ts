import db from "../../database/configuration.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters, type StarterBoxParametersTable } from "../../database/schemas/starter-parameters.js";
import { saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";

export async function saveLiveDataTopic(insertedData: any, groupId: string) {

  switch (groupId) {
    case "G01": //  Live data topic
      await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, insertedData);
      break;
    case "G02":
      // Update Device power & motor state to ON
      await updateDevicePowerAndMotorStateToON(insertedData);
      break;
    case "G03":
      // Update Device power On & motor state to Off
      await updateDevicePowerONAndMotorStateOFF(insertedData);
      break;
    case "G04":
      await updateDevicePowerAndMotorStateOFF(insertedData);
      break;
    default:
      return null;
  }
}

export async function updateDevicePowerAndMotorStateToON(insertedData: any) {
  const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;
  if (!starter_id || !motor_id || power_present !== 1) return null;

  await db.transaction(async (trx) => {
    await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, insertedData, trx);
    await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, { power: 1 }, trx);
    await updateRecordByIdWithTrx<MotorsTable>(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
  });
}

export async function updateDevicePowerONAndMotorStateOFF(insertedData: any) {
  const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;

  if (!starter_id || !motor_id || power_present !== 1) return null;

  await db.transaction(async (trx) => {
    await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, insertedData, trx);
    await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, { power: 1 }, trx);
    await updateRecordByIdWithTrx<MotorsTable>(motors, motor_id, { state: motor_state }, trx);
  });
}

export async function updateDevicePowerAndMotorStateOFF(insertedData: any) {
  const { starter_id, motor_id, motor_state, mode_description } = insertedData;

  if (!starter_id || !motor_id) return null;

  await db.transaction(async (trx) => {
    await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, { power: 0 }, trx);
    await updateRecordByIdWithTrx<MotorsTable>(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
  });
}

