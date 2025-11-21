import type { Context } from "hono";
import factory from "../factory.js";
import argon2 from "argon2";
import { EMAIL_EXISTED, SIGNUP_VALIDATION_CRITERIA, USER_CREATED } from "../constants/app-constants.js";
import { validatedRequest } from "../validations/validate-request.js";
import type { ValidatedAddUser } from "../validations/schema/user-validations.js";
import { getSingleRecordByMultipleColumnValues, saveRecord } from "../services/db/base-db-services.js";
import { users, type NewUser, type User, type UsersTable, } from "../database/schemas/users.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { sendResponse } from "../utils/send-response.js";
import { CREATED } from "../constants/http-status-codes.js";


export class AuthHandlers {

    createUserHandlers = factory.createHandlers(
        async (c: Context) => {
            const reqBody = await c.req.json();
            const validUserReq = await validatedRequest<ValidatedAddUser>("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);
            const existingUser = await getSingleRecordByMultipleColumnValues(users, ["email", "status"], ["=", "="], [validUserReq.email, "ARCHIVED"], ["id"]);
            if (existingUser) throw new ConflictException(EMAIL_EXISTED);

            const hashedPassword = await argon2.hash(validUserReq.password);
            const userData: NewUser = { ...validUserReq, password: hashedPassword };
            const { password, ...user } = await saveRecord<UsersTable>(users, userData);
            return sendResponse(c, CREATED, USER_CREATED, user);
        },
    );

}