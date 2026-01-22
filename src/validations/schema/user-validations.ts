import { ADDRESS_STRING, MOBILE_NUMBER_ALREADY_EXIST, MOBILE_NUMBER_UNIQUE, REFEREED_BY_REQUIRED } from "../../constants/app-constants.js";
import { emailValidator, nameValidator, otpValidator, passwordValidator, phoneValidator, requiredNumberOptional, userTypeValidator } from "./common-validations.js";
import * as v from "valibot";

export const vSignUp = v.pipe(
    v.object({
        full_name: nameValidator,
        email: emailValidator,
        phone: phoneValidator,
        password: passwordValidator,
        address: v.nullish(v.optional(v.string(ADDRESS_STRING))),
        user_type: userTypeValidator,
        created_by: v.optional(v.number()),
        referred_by: requiredNumberOptional(REFEREED_BY_REQUIRED),
        signature_id: v.optional(v.string()),
        alternate_phone_1: v.optional(v.nullish(phoneValidator)),
        alternate_phone_2: v.optional(v.nullish(phoneValidator)),
        alternate_phone_3: v.optional(v.nullish(phoneValidator)),
        alternate_phone_4: v.optional(v.nullish(phoneValidator)),
        alternate_phone_5: v.optional(v.nullish(phoneValidator)),
    }),
);

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


export type ValidatedSignUpUser = v.InferOutput<typeof vSignUp>;
export type ValidatedSignInEmail = v.InferOutput<typeof vSignInEmail>;
export type ValidatedSignInPhone = v.InferOutput<typeof vSignInPhone>;
export type ValidatedVerifyOtp = v.InferOutput<typeof vVerifyOtp>;
