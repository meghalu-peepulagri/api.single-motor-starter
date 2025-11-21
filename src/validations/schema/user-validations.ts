import { ADDRESS_STRING } from "../../constants/app-constants.js";
import { emailValidator, nameValidator, passwordValidator, phoneValidator, userTypeValidator } from "./vCommonSchemas.js";
import * as v from "valibot";

export const vAddUserValidator = v.object({
    full_name: nameValidator,
    email: emailValidator,
    phone: phoneValidator,
    password: passwordValidator,
    address: v.optional(v.string(ADDRESS_STRING)),
    user_type: userTypeValidator,
    created_by: v.optional(v.number()),
});

export type ValidatedAddUser = v.InferOutput<typeof vAddUserValidator>;
