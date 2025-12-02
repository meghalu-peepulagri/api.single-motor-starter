import type { Context } from "hono";
import { FIELD_NOT_FOUND, MOTOR_ADDED, MOTOR_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { fields, type FieldsTable } from "../database/schemas/fields.js";
import { motors, type MotorsTable } from "../database/schemas/motors.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord } from "../services/db/base-db-services.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { validatedAddMotor } from "../validations/schema/motor-validations.js";
import { validatedRequest } from "../validations/validate-request.js";

const paramsValidateException = new ParamsValidateException();

export class MotorHandlers {

  addMotor = async (c: Context) => {
    try {
      const userPayload = c.get("user_payload");
      const motorPayload = await c.req.json();
      paramsValidateException.emptyBodyValidation(motorPayload);
      const validMotorReq = await validatedRequest<validatedAddMotor>("add-motor", motorPayload, MOTOR_VALIDATION_CRITERIA);

      const field = await getSingleRecordByMultipleColumnValues<FieldsTable>(fields, ["id", "status"], ["=", "!="], [validMotorReq.field_id, "ARCHIVED"]);
      if (!field) throw new NotFoundException(FIELD_NOT_FOUND);

      await saveSingleRecord<MotorsTable>(motors, { ...validMotorReq, created_by: userPayload.id, hp: validMotorReq.hp.toString() });
      return sendResponse(c, 201, MOTOR_ADDED);
    } catch (error: any) {
      console.error("Error at add motor :", error);
      handleJsonParseError(error);
      parseDatabaseError(error);
      handleForeignKeyViolationError(error);
      throw error;
    }
  };

}