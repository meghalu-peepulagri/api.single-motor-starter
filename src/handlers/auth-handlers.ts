import argon2 from "argon2";
import type { Context } from "hono";
import moment from "moment";
import { INVALID_CREDENTIALS, INVALID_OTP, LOGIN_DONE, LOGIN_VALIDATION_CRITERIA, MOBILE_NUMBER_ALREADY_EXIST, OTP_SENT, SIGNUP_VALIDATION_CRITERIA, USER_CREATED, USER_LOGIN, USER_NOT_EXIST_WITH_PHONE, VERIFY_OTP_VALIDATION_CRITERIA } from "../constants/app-constants.js";
import { CREATED } from "../constants/http-status-codes.js";
import db from "../database/configuration.js";
import { deviceTokens, type DeviceTokensTable } from "../database/schemas/device-tokens.js";
import { type NewOtp } from "../database/schemas/otp.js";
import { users, type NewUser, type UsersTable } from "../database/schemas/users.js";
import NotFoundException from "../exceptions/not-found-exception.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import UnauthorizedException from "../exceptions/unauthorized-exception.js";
import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
import { prepareOTPData } from "../helpers/otp-helper.js";
import { checkInternalPhoneUniqueness } from "../helpers/user-helper.js";
import { ActivityService } from "../services/db/activity-service.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord } from "../services/db/base-db-services.js";
import { OtpService } from "../services/db/otp-services.js";
import { SmsService } from "../services/sms/sms-service.js";
import { genJWTTokensForUser } from "../utils/jwt-utils.js";
import { handleForeignKeyViolationError, handleJsonParseError, parseDatabaseError } from "../utils/on-error.js";
import { sendResponse } from "../utils/send-response.js";
import type { ValidatedSignInEmail, ValidatedSignInPhone, ValidatedSignUpUser, ValidatedVerifyOtp } from "../validations/schema/user-validations.js";
import { validatedRequest } from "../validations/validate-request.js";

import ConflictException from "../exceptions/conflict-exception.js";
import { checkPhoneUniqueness, checkPhoneUniquenessVerify } from "../services/db/user-services.js";

const paramsValidateException = new ParamsValidateException();
const otpService = new OtpService();
const smsService = new SmsService();

export class AuthHandlers {
    // TODO : Reduce the code length
    userRegisterHandler = async (c: Context) => {
        try {
            const userPayload = c.get("user_payload");
            const reqBody = await c.req.json();

            paramsValidateException.emptyBodyValidation(reqBody);

            const validUserReq = await validatedRequest<ValidatedSignUpUser>("signup", reqBody, SIGNUP_VALIDATION_CRITERIA);

            const allPhones = checkInternalPhoneUniqueness(validUserReq);

            const isPhoneUnique = await checkPhoneUniqueness(allPhones);
            if (!isPhoneUnique) {
                throw new ConflictException(MOBILE_NUMBER_ALREADY_EXIST);
            }

            const hashedPassword = validUserReq.password ? await argon2.hash(validUserReq.password) : await argon2.hash("i@123456");

            const isAdmin = userPayload?.user_type === "ADMIN";
            const user_verified = isAdmin ? true : false;

            const userData: NewUser = {
                ...validUserReq,
                password: hashedPassword,
                user_verified,
                created_by: userPayload ? userPayload.id : null,
                notifications_enabled: ["STATE", "MODE", "ALERTS-FAULTS"],
            };

            let createdUser: any;

            await db.transaction(async (trx) => {
                createdUser = await saveSingleRecord<UsersTable>(users, userData, trx);
                if (!createdUser) return;
                await ActivityService.logActivity({
                    userId: Number(createdUser.id),
                    performedBy: userPayload?.id ?? Number(createdUser.id),
                    action: "REGISTERED",
                    entityType: "AUTH",
                    entityId: Number(createdUser.id),
                }, trx);

            });

            if (!userPayload && createdUser) {
                const phone = createdUser.phone;
                const otpData = prepareOTPData(phone, "REGISTERED");
                await otpService.createOTP(otpData);
                await smsService.sendSms(phone, otpData.otp, validUserReq.signature_id);
            }

            return sendResponse(c, CREATED, USER_CREATED);
        } catch (error: any) {
            console.error("Error at register user :", error);
            handleJsonParseError(error);
            parseDatabaseError(error);
            handleForeignKeyViolationError(error);
            throw error;
        }
    };

    signInWithEmailHandler = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validUserReq = await validatedRequest<ValidatedSignInEmail>("signin-email", reqBody, LOGIN_VALIDATION_CRITERIA);

            const loginUser = validUserReq.email && await getSingleRecordByMultipleColumnValues<UsersTable>(users, ["email", "status"], ["LOWER", "!="], [validUserReq.email.toLowerCase(), "ARCHIVED"]);
            if (!loginUser || !loginUser.password) throw new UnauthorizedException(INVALID_CREDENTIALS);

            const isPasswordMatched = await argon2.verify(loginUser.password, validUserReq.password);
            if (!isPasswordMatched) throw new UnauthorizedException(INVALID_CREDENTIALS);

            const { access_token, refresh_token } = await genJWTTokensForUser(loginUser.id);
            const { password, ...userWithoutPassword } = loginUser;

            const response = { user_details: userWithoutPassword, access_token, refresh_token };
            return sendResponse(c, CREATED, LOGIN_DONE, response);
        } catch (error: any) {
            console.error("Error at sign in with email :", error);
            handleJsonParseError(error);
            console.error("Error at sign in with email :", error);
            throw error;
        }
    }

    signInWithPhoneHandler = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);
            const validatedPhone = await validatedRequest<ValidatedSignInPhone>("signin-phone", reqBody, LOGIN_VALIDATION_CRITERIA);

            const loginUser = await checkPhoneUniqueness([validatedPhone.phone])
            if (loginUser === true) throw new NotFoundException(USER_NOT_EXIST_WITH_PHONE);

            const otpData = prepareOTPData(validatedPhone.phone, "SIGN_IN_WITH_OTP");
            await otpService.createOTP(otpData);
            await smsService.sendSms(validatedPhone.phone, otpData.otp, validatedPhone.signature_id);
            return sendResponse(c, CREATED, OTP_SENT);
        } catch (error: any) {
            console.error("Error at sign in with phone :", error);
            handleJsonParseError(error);
            console.error("Error at sign in with phone :", error);
            throw error;
        }
    }


    verifyOtpHandler = async (c: Context) => {
        try {
            const reqBody = await c.req.json();
            paramsValidateException.emptyBodyValidation(reqBody);

            const validReqData = await validatedRequest<ValidatedVerifyOtp>("verify-otp", reqBody, VERIFY_OTP_VALIDATION_CRITERIA);

            const user = await checkPhoneUniquenessVerify([validReqData.phone])
            if (user === true) throw new NotFoundException(USER_NOT_EXIST_WITH_PHONE);

            const otpData: NewOtp[] = await otpService.fetchOtp({ phone: validReqData.phone });
            const now = moment.utc();

            const otpValidationErrors: Record<string, string> = {};
            let otp = otpData[0];

            if (!otp || otp.otp !== validReqData.otp || !otp.expires_at || moment.utc(otp.expires_at).isBefore(now)) {
                otpValidationErrors.otp = INVALID_OTP;
            }

            if (Object.keys(otpValidationErrors).length > 0) {
                throw new UnprocessableEntityException(VERIFY_OTP_VALIDATION_CRITERIA, otpValidationErrors);
            }

            const validOtp = otp as Required<NewOtp>;
            const updatedUser = await otpService.verifyOtpAndUpdateUser(validOtp.id, user[0].id);

            const { access_token, refresh_token } = await genJWTTokensForUser(user[0].id);
            const { password, ...userDetails } = updatedUser;

            const data = { user_details: userDetails, access_token, refresh_token };

            if (validReqData.fcm_token) {
                const fcmToken = validReqData.fcm_token;
                const existingToken = await getSingleRecordByMultipleColumnValues<DeviceTokensTable>(deviceTokens, ["device_token", "user_id"], ["=", "="], [fcmToken, user[0].id]);

                if (!existingToken) {
                    const checkOtherDevice = await getSingleRecordByMultipleColumnValues<DeviceTokensTable>(deviceTokens, ["user_id"], ["="], [user[0].id]);
                    if (!checkOtherDevice || checkOtherDevice.device_token !== fcmToken) {
                        await saveSingleRecord<DeviceTokensTable>(deviceTokens, { device_token: fcmToken, user_id: user[0].id });
                    }
                }
            }
            return sendResponse(c, 200, USER_LOGIN, data);
        }
        catch (err: any) {
            console.error("Error at verify otp", err.message);
            handleJsonParseError(err);
            console.error("Error at verify otp", err.message);
            throw err;
        }
    };
}