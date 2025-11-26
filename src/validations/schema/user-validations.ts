import { ADDRESS_STRING } from "../../constants/app-constants.js";
import { emailValidator, nameValidator, passwordValidator, phoneValidator, userTypeValidator } from "./common-validations.js";
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


export type ValidatedSignUpUser = v.InferOutput<typeof vSignUp>;
export type ValidatedSignInEmail = v.InferOutput<typeof vSignInEmail>;

