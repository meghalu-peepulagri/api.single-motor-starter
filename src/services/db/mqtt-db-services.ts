import db from "../../database/configuration.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterBoxParameters, type StarterBoxParametersTable } from "../../database/schemas/starter-parameters.js";
import { controlMode } from "../../helpers/control-helpers.js";
import { saveSingleRecord, updateRecordById, updateRecordByIdWithTrx } from "./base-db-services.js";
import { getStarterByMacWithMotor } from "./starter-services.js";


// Live data
export async function saveLiveDataTopic(insertedData: any, groupId: string) {

  switch (groupId) {
    case "G01": //  Live data topic
      await updateStates(insertedData);
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

export async function updateStates(insertedData: any) {
  const { starter_id, motor_id, power_present, motor_state, mode_description } = insertedData;
  if (!starter_id) return null;
  await db.transaction(async (trx) => {
    await saveSingleRecord<StarterBoxParametersTable>(starterBoxParameters, insertedData, trx);
    await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starter_id, { power: power_present }, trx);
    if (motor_id) await updateRecordByIdWithTrx<MotorsTable>(motors, motor_id, { state: motor_state, mode: mode_description }, trx);
  });
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

// Motor control ack
export async function motorControlAckHandler(message: any, topic: string) {
  console.log('message: ', message);
  try {
    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    console.log('validMac: ', validMac);
    if (!validMac?.id) {
      console.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };

    await updateRecordById<MotorsTable>(motors, validMac.motors[0].id, { state: message.D });
  } catch (error: any) {
    console.error("Error at motor control ack topic handler:", error);
    throw error;
  }
}


// Motor mode ack
export async function motorModeChangeAckHandler(message: any, topic: string) {
  try {
    const validMac = await getStarterByMacWithMotor(topic.split("/")[1]);
    if (!validMac?.id) {
      console.error(`Any starter found with given MAC [${topic}]`)
      return null;
    };

    const mode = controlMode(message.D);
    await updateRecordById<MotorsTable>(motors, validMac.motors[0].id, { mode });
  } catch (error: any) {
    console.error("Error at motor control ack topic handler:", error);
    throw error;
  }
}
