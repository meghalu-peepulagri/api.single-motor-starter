import * as v from "valibot";
import { EMAIL_REQUIRED, INVALID_PHONE_NUMBER, INVALID_PHONE_NUMBER_VALID_LENGTH, NAME_MIN_LENGTH, NAME_REQUIRED, PASSWORD_MIN_LENGTH, PASSWORD_REQUIRED, PASSWORD_SHOULD_CONTAIN_NUMBER, PASSWORD_SHOULD_CONTAIN_UPPERCASE, PASSWORD_SPECIAL_CHAR, PHONE_NUMBER_REQUIRED, TITLE_MUST_BE_STRING, TITLE_REQUIRED, USER_TYPE_INVALID, USER_TYPE_REQUIRED, VALID_MAIL, VALID_NAME } from "../../constants/app-constants.js";
import { userTypeEnum } from "../../constants/enum-types.js";
const phoneValidator = v.pipe(v.string(PHONE_NUMBER_REQUIRED), v.trim(), v.nonEmpty(PHONE_NUMBER_REQUIRED), v.regex(/^\d+$/, INVALID_PHONE_NUMBER), v.regex(/^[6-9]\d{9}$/, INVALID_PHONE_NUMBER_VALID_LENGTH));
const emailValidator = v.pipe(v.string(EMAIL_REQUIRED), v.transform(value => value.trim()), v.nonEmpty(EMAIL_REQUIRED), v.email(VALID_MAIL));
const passwordValidator = v.optional(v.pipe(v.string(PASSWORD_REQUIRED), v.transform(value => value.trim()), v.nonEmpty(PASSWORD_REQUIRED), v.minLength(6, PASSWORD_MIN_LENGTH), v.regex(/^(?=.*[A-Z]).*$/, PASSWORD_SHOULD_CONTAIN_UPPERCASE), v.regex(/^(?=.*[0-9]).*$/, PASSWORD_SHOULD_CONTAIN_NUMBER), v.regex(/^(?=.*[@$!%*#?&]).*$/, PASSWORD_SPECIAL_CHAR)));
const nameValidator = v.pipe(v.string(NAME_REQUIRED), v.transform(value => value.trim()), v.nonEmpty(NAME_REQUIRED), v.regex(/^[A-Z ]+$/i, VALID_NAME), v.minLength(3, NAME_MIN_LENGTH));
const userTypeValidator = v.pipe(v.string(USER_TYPE_REQUIRED), v.transform(value => value.trim().toUpperCase()), v.nonEmpty(USER_TYPE_REQUIRED), v.picklist(userTypeEnum.enumValues, USER_TYPE_INVALID));
const locationTitleValidator = v.pipe(v.string(TITLE_MUST_BE_STRING), v.transform(value => value.trim()), v.nonEmpty(TITLE_REQUIRED), v.regex(/^[A-Z ]+$/i, VALID_NAME), v.minLength(3, NAME_MIN_LENGTH));
function requiredNumber(errorMessage) {
    return v.pipe(v.number(errorMessage), v.custom(val => typeof val === "number" && val !== 0, errorMessage));
}
export { emailValidator, locationTitleValidator, nameValidator, passwordValidator, phoneValidator, userTypeValidator };
