import argon2 from "argon2";
import { SIGNUP_VALIDATION_CRITERIA, USER_CREATED } from "../constants/app-constants.js";
import { CREATED } from "../constants/http-status-codes.js";
import { users } from "../database/schemas/users.js";
import { ParamsValidateException } from "../exceptions/paramsValidateException.js";
import factory from "../factory.js";
import { saveRecord } from "../services/db/base-db-services.js";
import { sendResponse } from "../utils/send-response.js";
import { validatedRequest } from "../validations/validate-request.js";
import db from "../database/configuration.js";
import { log } from "console";
const paramsValidateException = new ParamsValidateException();
export class AuthHandlers {
    // createUserHandlers = factory.createHandlers(
    //     async (c: Context) => {
    //         const reqBody = await c.req.json();
    //         paramsValidateException.emptyBodyValidation(reqBody);
    //         const validUserReq = await validatedRequest<ValidatedAddUser>("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);
    //         const hashedPassword = await argon2.hash(validUserReq.password);
    //         const userData: NewUser = { ...validUserReq, password: hashedPassword };
    //         // const { password, ...user } = await saveRecord<UsersTable>(users, userData);
    //         const user = await db.insert(users).values(userData).onConflictDoNothing();
    //         console.log("user", user);
    //         // if (user.rowCount === 0) {
    //         //     return sendResponse(c, 409, "Email or phone number already exists.");
    //         // }
    //         return sendResponse(c, CREATED, USER_CREATED, user);
    //     },
    // );
    createUserHandlers = async (c) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);
            const hashedPassword = await argon2.hash(validUserReq.password);
            const userData = { ...validUserReq, password: hashedPassword };
            // const { password, ...user } = await saveRecord<UsersTable>(users, userData);
            const user = await saveRecord(users, userData);
            console.log("user", user);
            // if (user.rowCount === 0) {
            //     return sendResponse(c, 409, "Email or phone number already exists.");
            // }
            return sendResponse(c, CREATED, USER_CREATED, user);
        }
        catch (error) {
            if (error.code === "23505") {
                console.log("error", error);
            }
            console.error("Error in register user :", error);
            throw error;
        }
    };
}
