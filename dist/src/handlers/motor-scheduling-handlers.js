import { ALREADY_SCHEDULED_EXISTS, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA, MOTOR_NOT_FOUND, SCHEDULE_DELETED, SCHEDULE_NOT_FOUND, SCHEDULE_UPDATED, SCHEDULED_CREATED, SCHEDULED_LIST_FETCHED } from "../constants/app-constants.js";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { motors } from "../database/schemas/motors.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import { checkMotorScheduleConflict } from "../helpers/motor-helper.js";
import { deleteRecordById, getPaginatedRecordsConditionally, getRecordById, getSingleRecordByMultipleColumnValues, saveRecords, saveSingleRecord, updateRecordById } from "../services/db/base-db-services.js";
import { getMotorSchedulesWeekly, getMotorSchedulesWeeklyUpdate, getOneTimeMotorSchedules, getOneTimeMotorSchedulesUpdate } from "../services/db/motor-schedules-services.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class MotorScheduleHandler {
    async createMotorScheduleHandler(c) {
        try {
            const reqData = await c.req.json();
            const validatedReqData = await validatedRequest("create-motor-schedule", reqData, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA);
            const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [validatedReqData.motor_id, "ARCHIVED"], ["id", "title", "pond_id"]);
            if (!existedMotor) {
                throw new BadRequestException(MOTOR_NOT_FOUND);
            }
            let existingMotorSchedule = null;
            if (validatedReqData.schedule_type === "ONE_TIME") {
                existingMotorSchedule = await getOneTimeMotorSchedules(existedMotor.id, validatedReqData?.schedule_date ?? "", validatedReqData.start_time, validatedReqData.end_time);
                await checkMotorScheduleConflict(validatedReqData, existingMotorSchedule);
            }
            if (validatedReqData.schedule_type === "DAILY" || validatedReqData.schedule_type === "WEEKLY") {
                existingMotorSchedule = await getMotorSchedulesWeekly(existedMotor.id, validatedReqData.schedule_type, validatedReqData.start_time, validatedReqData.end_time, validatedReqData?.days_of_week || []);
                await checkMotorScheduleConflict(validatedReqData, existingMotorSchedule);
            }
            const preparedScheduledData = {
                pond_id: existedMotor.pond_id,
                motor_id: validatedReqData.motor_id,
                schedule_type: validatedReqData.schedule_type,
                schedule_date: validatedReqData.schedule_date || null,
                start_time: validatedReqData.start_time,
                end_time: validatedReqData.end_time,
                days_of_week: validatedReqData?.days_of_week || [],
            };
            const createdScheduleDetails = await saveSingleRecord(motorSchedules, preparedScheduledData);
            return sendResponse(c, 201, SCHEDULED_CREATED, createdScheduleDetails);
        }
        catch (error) {
            if (error.code === "23505" && error.constraint === "uniqueMotorSchedule") {
                throw new ConflictException(ALREADY_SCHEDULED_EXISTS);
            }
            console.error("Error at create Motor Schedule : ", error.message);
            throw error;
        }
    }
    motorScheduleList = async (c) => {
        try {
            const motorId = +c.req.param("motor_id");
            const query = c.req.query();
            const page = +(query.page) || 1;
            const limit = +(query.limit) || 10;
            paramsValidateException.validateId(motorId, "motor id");
            const existedMotor = await getSingleRecordByMultipleColumnValues(motors, ["id", "status"], ["=", "!="], [motorId, "ARCHIVED"], ["id"]);
            if (!existedMotor) {
                throw new BadRequestException(MOTOR_NOT_FOUND);
            }
            const whereQueryData = {
                columns: ["motor_id"],
                values: [existedMotor.id],
                relations: ["="],
            };
            const orderByQueryData = {
                columns: ["created_at"],
                values: ["desc"],
            };
            const projection = ["id", "motor_id", "schedule_type", "schedule_date", "days_of_week", "start_time", "end_time", "acknowledgement", "schedule_status"];
            const motorScheduleList = await getPaginatedRecordsConditionally(motorSchedules, page, limit, orderByQueryData, whereQueryData, projection);
            return sendResponse(c, 200, SCHEDULED_LIST_FETCHED, motorScheduleList);
        }
        catch (error) {
            console.error("Error at motor Schedule List : ", error.message);
            throw error;
        }
    };
    editMotorSchedule = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const reqData = await c.req.json();
            const validatedReqData = await validatedRequest("create-motor-schedule", reqData, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA);
            const existedMotor = await getRecordById(motorSchedules, scheduleId, ["id", "motor_id"]);
            if (!existedMotor) {
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            }
            let existingMotorSchedule = null;
            if (validatedReqData.schedule_type === "ONE_TIME") {
                existingMotorSchedule = await getOneTimeMotorSchedulesUpdate(existedMotor.motor_id, validatedReqData.schedule_date ?? "", validatedReqData.start_time, validatedReqData.end_time, scheduleId);
                await checkMotorScheduleConflict(validatedReqData, existingMotorSchedule);
            }
            if (validatedReqData.schedule_type === "DAILY" || validatedReqData.schedule_type === "WEEKLY") {
                existingMotorSchedule = await getMotorSchedulesWeeklyUpdate(existedMotor.motor_id, validatedReqData.schedule_type, validatedReqData.start_time, validatedReqData.end_time, scheduleId, validatedReqData.days_of_week ?? "");
                await checkMotorScheduleConflict(validatedReqData, existingMotorSchedule);
            }
            await updateRecordById(motorSchedules, existedMotor.id, validatedReqData);
            return sendResponse(c, 200, SCHEDULE_UPDATED);
        }
        catch (error) {
            console.error("Error at edit motor Schedule : ", error.message);
            throw error;
        }
    };
    deleteMotorSchedule = async (c) => {
        try {
            const scheduleId = +c.req.param("id");
            paramsValidateException.validateId(scheduleId, "schedule id");
            const existedId = await getRecordById(motorSchedules, scheduleId, ["id"]);
            if (!existedId) {
                throw new BadRequestException(SCHEDULE_NOT_FOUND);
            }
            await deleteRecordById(motorSchedules, existedId.id);
            return sendResponse(c, 200, SCHEDULE_DELETED);
        }
        catch (error) {
            console.error("Error at delete motor Schedule : ", error.message);
            throw error;
        }
    };
    createMotorScheduleForPond = async (c) => {
        try {
            const reqData = await c.req.json();
            const validatedReqData = await validatedRequest("create-motor-schedule", reqData, CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA);
            const preparedScheduledData = validatedReqData.map(item => ({
                pond_id: item.pond_id,
                motor_id: item.motor_id,
                schedule_type: item.schedule_type,
                schedule_date: item.schedule_date || null,
                days_of_week: item.days_of_week || [],
                start_time: item.start_time,
                end_time: item.end_time,
            }));
            await saveRecords(motorSchedules, preparedScheduledData);
            return sendResponse(c, 201, SCHEDULED_CREATED);
        }
        catch (error) {
            if (error.code === "23505" && error.constraint === "uniqueMotorSchedule") {
                throw new ConflictException(ALREADY_SCHEDULED_EXISTS);
            }
            console.error("Error at create motor Schedule for pond : ", error.message);
            throw error;
        }
    };
}
