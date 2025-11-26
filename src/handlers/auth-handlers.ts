import argon2 from "argon2";
import type { Context } from "hono";
import { INVALID_CREDENTIALS, LOGIN_DONE, LOGIN_VALIDATION_CRITERIA, SIGNUP_VALIDATION_CRITERIA, USER_CREATED } from "../constants/app-constants.js";
import { CREATED } from "../constants/http-status-codes.js";
import db from "../database/configuration.js";
import { userActivityLogs, type NewUserActivityLog } from "../database/schemas/user-activity-logs.js";
import { users, type NewUser, type UsersTable } from "../database/schemas/users.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord } from "../services/db/base-db-services.js";
import { genJWTTokensForUser } from "../utils/jwt-utils.js";
import { handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedSignInEmail, ValidatedSignUpUser } from "../validations/schema/user-validations.js";
import { validatedRequest } from "../validations/validate-request.js";

const paramsValidateException = new ParamsValidateException();

export class AuthHandlers {
    userRegisterHandlers = async (c: Context) => {
        try {
            const userPayload = c.get("user_payload");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest<ValidatedSignUpUser>("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);

            const hashedPassword = validUserReq.password ? await argon2.hash(validUserReq.password) : await argon2.hash("123456");
            const userData: NewUser = { ...validUserReq, password: hashedPassword, created_by: userPayload ? userPayload.id : null };
            await db.transaction(async (trx) => {
                const createdUser = await saveSingleRecord<UsersTable>(users, userData, trx);
                if (!createdUser) return;

                const logData: NewUserActivityLog = {
                    user_id: Number(createdUser.id),
                    action: "REGISTERED",
                    performed_by: userPayload?.id ?? Number(createdUser.id),
                    old_data: null,
                    new_data: null,
                };
                await saveSingleRecord(userActivityLogs, logData, trx);
            });
            return sendResponse(c, CREATED, USER_CREATED);
        } catch (error: any) {
            handleJsonParseError(error);
            parseDatabaseError(error);
            console.error("Error at register user :", error);
            throw error;
        }
    }

    signInWithEmailHandlers = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest<ValidatedSignInEmail>("signin-email", reqBody, LOGIN_VALIDATION_CRITERIA);

            const loginUser = await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["email", "status"], ["=", "!="], [validUserReq.email, "ARCHIVED"]);
            if (!loginUser || !loginUser.password) throw new UnauthorizedException(INVALID_CREDENTIALS);

            const isPasswordMatched = await argon2.verify(loginUser.password, validUserReq.password);
            if (!isPasswordMatched) throw new UnauthorizedException(INVALID_CREDENTIALS);

            const { access_token, refresh_token } = await genJWTTokensForUser(loginUser.id);
            const { password, ...userWithoutPassword } = loginUser;

            const response = { user_details: userWithoutPassword, access_token, refresh_token };
            return sendResponse(c, CREATED, LOGIN_DONE, response);
        } catch (error: any) {
            handleJsonParseError(error);
            console.error("Error at sign in with email :", error);
            throw error;
        }
    }
}