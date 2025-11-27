import { ADDRESS_STRING } from "../../constants/app-constants.js";
import { emailValidator, nameValidator, otpValidator, passwordValidator, phoneValidator, userTypeValidator } from "./common-validations.js";
import * as v from "valibot";
export const vSignUp = v.object({
    full_name: nameValidator,
    email: emailValidator,
    phone: phoneValidator,
    password: passwordValidator,
    address: v.optional(v.string(ADDRESS_STRING)),
    user_type: userTypeValidator,
    created_by: v.optional(v.number()),
});
export const vSignInEmail = v.object({
    email: emailValidator,
    password: v.pipe(v.string("Password is required"), v.nonEmpty("Password is required")),
});
export const vSignInPhone = v.object({
    phone: phoneValidator,
    signature_id: v.optional(v.string()),
});
export const vVerifyOtp = v.object({
    phone: phoneValidator,
    otp: otpValidator,
    fcm_token: v.nullish(v.string()),
});
