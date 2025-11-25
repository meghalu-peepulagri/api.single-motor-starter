import argon2 from "argon2";
import { INVALID_CREDENTIALS, LOGIN_DONE, LOGIN_VALIDATION_CRITERIA, SIGNUP_VALIDATION_CRITERIA, USER_CREATED } from "../constants/app-constants.js";
import { CREATED } from "../constants/http-status-codes.js";
import { users } from "../database/schemas/users.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import { getSingleRecordByMultipleColumnValues, saveRecord } from "../services/db/base-db-services.js";
import { genJWTTokensForUser } from "../utils/jwt-utils.js";
import { parseUniqueConstraintError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
const paramsValidateException = new ParamsValidateException();
export class AuthHandlers {
    userRegisterHandlers = async (c) => {
        try {
            const userPayload = c.get("user_payload");
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);
            const hashedPassword = validUserReq.password ? await argon2.hash(validUserReq.password) : await argon2.hash("123456");
            const userData = { ...validUserReq, password: hashedPassword, created_by: userPayload ? userPayload.id : null };
            await saveRecord(users, userData);
            return sendResponse(c, CREATED, USER_CREATED);
        }
        catch (error) {
            if (error.message?.includes("Unexpected end of JSON")) {
                throw new BadRequestException("Invalid or missing JSON body");
            }
            const pgError = error.cause ?? error;
            if (pgError?.code === "23505") {
                return parseUniqueConstraintError(pgError);
            }
            console.error("Error at register user :", error);
            throw error;
        }
    };
    signInWithEmailHandlers = async (c) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest("signin-email", reqBody, LOGIN_VALIDATION_CRITERIA);
            const loginUser = await getSingleRecordByMultipleColumnValues(users, ["email", "status"], ["=", "!="], [validUserReq.email, "ARCHIVED"]);
            if (!loginUser || !loginUser.password)
                throw new UnauthorizedException(INVALID_CREDENTIALS);
            const isPasswordMatched = await argon2.verify(loginUser.password, validUserReq.password);
            if (!isPasswordMatched)
                throw new UnauthorizedException(INVALID_CREDENTIALS);
            const { access_token, refresh_token } = await genJWTTokensForUser(loginUser.id);
            const { password, ...userWithoutPassword } = loginUser;
            const response = { user_details: userWithoutPassword, access_token, refresh_token };
            return sendResponse(c, CREATED, LOGIN_DONE, response);
        }
        catch (error) {
            if (error.message?.includes("Unexpected end of JSON")) {
                throw new BadRequestException("Invalid or missing JSON body");
            }
            console.error("Error at sign in with email :", error);
            throw error;
        }
    };
}
