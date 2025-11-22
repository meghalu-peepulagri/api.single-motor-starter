import argon2 from "argon2";
import type { Context } from "hono";
import { SIGNUP_VALIDATION_CRITERIA, USER_CREATED } from "../constants/app-constants.js";
import { CREATED } from "../constants/http-status-codes.js";
import { users, type NewUser, type UsersTable } from "../database/schemas/users.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import factory from "../factory.js";
import { saveRecord } from "../services/db/base-db-services.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedAddUser } from "../validations/schema/user-validations.js";
import { validatedRequest } from "../validations/validate-request.js";

const paramsValidateException = new ParamsValidateException();

export class AuthHandlers {

    createUserHandlers = factory.createHandlers(
        async (c: Context) => {
            const reqBody = await c.req.json();            
            paramsValidateException.emptyBodyValidation(reqBody); 

            const validUserReq = await validatedRequest<ValidatedAddUser>("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);
            const hashedPassword = await argon2.hash(validUserReq.password);
            const userData: NewUser = { ...validUserReq, password: hashedPassword };
            const { password, ...user } = await saveRecord<UsersTable>(users, userData);
            return sendResponse(c, CREATED, USER_CREATED, user);
        },
    );

}