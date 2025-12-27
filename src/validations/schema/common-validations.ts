import * as v from "valibot";

import { DEVICE_MIN_LEN, DEVICE_NAME_REQUIRED, DEVICE_NAME_STARTS_LETTER, EMAIL_REQUIRED, FIELD_NAME_INVALID, FIELD_NAME_MIN_LEN, FIELD_NAME_MUST_STRING, FIELD_NAME_REQUIRED, HP_MAX, HP_MIN, HP_REQUIRED, ID_INVALID, ID_NUMBER, INVALID_OTP, INVALID_OTP_LENGTH, INVALID_PHONE, INVALID_PHONE_NUMBER, INVALID_PHONE_NUMBER_VALID_LENGTH, LOCATION_NAME_INVALID, LOCATION_NAME_MIN_LEN, MAC_MIN_LEN, MAC_REQUIRED, MIN_3_CHARACTERS_REQUIRED, MOTOR_MIN_LENGTH, MOTOR_NAME, MOTOR_NAME_STARTS_LETTER, MOTOR_REQUIRED, NAME_MIN_LENGTH, NAME_REQUIRED, OTP_REQUIRED, PASSWORD_MIN_LENGTH, PASSWORD_REQUIRED, PASSWORD_SHOULD_CONTAIN_NUMBER, PASSWORD_SHOULD_CONTAIN_UPPERCASE, PASSWORD_SPECIAL_CHAR, PCB_MIN_LEN, PCB_NUMBER_REQUIRED, PCB_SERIAL_NUMBER_REQUIRED, PHONE_NUMBER_REQUIRED, SERIAL_NO_MIN_LEN, SERIAL_NO_REQUIRED, SMALL_LETTERS_NOT_ALLOWED, STARTER_NUMBER_MIN_LEN, STARTER_NUMBER_REQUIRED, TITLE_MUST_BE_STRING, TITLE_REQUIRED, USER_TYPE_INVALID, USER_TYPE_REQUIRED, VALID_MAIL, VALID_NAME } from "../../constants/app-constants.js";
import { userTypeEnum } from "../../constants/enum-types.js";


const phoneValidator = v.pipe(
  v.string(PHONE_NUMBER_REQUIRED),
  v.trim(),
  v.nonEmpty(PHONE_NUMBER_REQUIRED),
  v.regex(/^\d+$/, INVALID_PHONE_NUMBER),
  v.regex(/^[6-9]\d{9}$/, INVALID_PHONE_NUMBER_VALID_LENGTH),
  v.regex(/^(?!([6-9])\1{9}$).+$/, INVALID_PHONE)
);


const emailValidator = v.optional(v.pipe(
  v.string(EMAIL_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(EMAIL_REQUIRED),
  v.email(VALID_MAIL),
));

const passwordValidator = v.optional(
  v.pipe(
    v.string(PASSWORD_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(PASSWORD_REQUIRED),
    v.minLength(6, PASSWORD_MIN_LENGTH),
    v.regex(/^(?=.*[A-Z]).*$/, PASSWORD_SHOULD_CONTAIN_UPPERCASE),
    v.regex(/^(?=.*[0-9]).*$/, PASSWORD_SHOULD_CONTAIN_NUMBER),
    v.regex(/^(?=.*[@$!%*#?&]).*$/, PASSWORD_SPECIAL_CHAR),
  )
);

const nameValidator = v.pipe(
  v.string(NAME_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(NAME_REQUIRED),
  v.regex(/^[A-Z ]+$/i, VALID_NAME),
  v.minLength(3, NAME_MIN_LENGTH),
);


const userTypeValidator = v.pipe(
  v.string(USER_TYPE_REQUIRED),
  v.transform(value => value.trim().toUpperCase()),
  v.nonEmpty(USER_TYPE_REQUIRED),
  v.picklist(userTypeEnum.enumValues, USER_TYPE_INVALID),
);

const locationTitleValidator = v.pipe(
  v.string(TITLE_MUST_BE_STRING),
  v.transform(value => value.trim()),
  v.nonEmpty(TITLE_REQUIRED),
  v.regex(/^[A-Z ]+$/i, LOCATION_NAME_INVALID),
  v.minLength(3, LOCATION_NAME_MIN_LEN),
);

const otpValidator = v.pipe(
  v.string(OTP_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(OTP_REQUIRED),
  v.regex(/^\d+$/, INVALID_OTP),
  v.regex(/^\d{4}$/, INVALID_OTP_LENGTH),
);


export const idValidator = v.pipe(
  v.number(ID_NUMBER),
  v.minValue(1, ID_INVALID)
);


const motorNameValidator = v.pipe(
  v.string(MOTOR_NAME),
  v.transform(value => value.trim()),
  v.nonEmpty(MOTOR_REQUIRED),
  v.regex(/^[A-Z].*$/i, MOTOR_NAME_STARTS_LETTER),
  v.minLength(3, MOTOR_MIN_LENGTH),
);

const hpValidator = v.pipe(
  v.number(HP_REQUIRED),
  v.minValue(1, HP_MIN),
  v.maxValue(30, HP_MAX),
)

export const filedNameValidator = v.pipe(
  v.string(FIELD_NAME_MUST_STRING),
  v.transform(value => value.trim()),
  v.nonEmpty(FIELD_NAME_REQUIRED),
  v.regex(/^[A-Z ]+$/i, FIELD_NAME_INVALID),
  v.minLength(3, FIELD_NAME_MIN_LEN),
);


function requiredNumber(errorMessage: string) {
  return v.pipe(
    v.number(errorMessage),
    v.custom(val => typeof val === "number" && val !== 0, errorMessage),
  );
}

function requiredNumberOptional(errorMessage: string) {
  return v.optional(v.pipe(v.number(errorMessage),
    v.custom((value) => value !== 0, errorMessage)
  )
  );
}

const aliasStarterNameValidator = v.optional(v.pipe(
  v.string(DEVICE_NAME_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(DEVICE_NAME_REQUIRED),
  v.regex(/^[A-Z].*$/i, DEVICE_NAME_STARTS_LETTER),
  v.minLength(3, DEVICE_MIN_LEN),
));

const starterBoxTitleValidator = v.optional(v.pipe(
  v.string(DEVICE_NAME_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(DEVICE_NAME_REQUIRED),
  v.regex(/^[A-Z].*$/i, DEVICE_NAME_STARTS_LETTER),
  v.minLength(3, DEVICE_MIN_LEN),
));


const macAddressValidator = v.optional(v.pipe(
  v.string(MAC_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(MAC_REQUIRED),
  v.regex(/^([0-9A-Z:]+)$/, "Small letters or spaces are not allowed"),
  v.minLength(3, MAC_MIN_LEN),
));

const serialNoValidator = v.pipe(
  v.string(SERIAL_NO_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(SERIAL_NO_REQUIRED),
  v.regex(/^[A-Z0-9]+$/, SMALL_LETTERS_NOT_ALLOWED),
  v.minLength(3, SERIAL_NO_MIN_LEN),
);

const pcbNumberValidator = v.optional(v.pipe(
  v.string(PCB_NUMBER_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(PCB_NUMBER_REQUIRED),
  v.regex(/^[A-Z0-9]+$/, SMALL_LETTERS_NOT_ALLOWED),
  v.minLength(3, PCB_MIN_LEN),
));

const starterNumberValidator = v.pipe(
  v.string(STARTER_NUMBER_REQUIRED),
  v.trim(),
  v.nonEmpty(STARTER_NUMBER_REQUIRED),
  v.regex(/^[A-Z0-9]+$/, SMALL_LETTERS_NOT_ALLOWED),
  v.minLength(3, STARTER_NUMBER_MIN_LEN),
);

const pcbOrSerialNumberValidator = v.pipe(
  v.string(PCB_SERIAL_NUMBER_REQUIRED),
  v.transform(value => value.trim()),
  v.nonEmpty(PCB_SERIAL_NUMBER_REQUIRED),
  v.regex(/^[A-Z0-9]+$/, SMALL_LETTERS_NOT_ALLOWED),
  v.minLength(3, MIN_3_CHARACTERS_REQUIRED),
);

export {
  emailValidator, locationTitleValidator, nameValidator,
  passwordValidator, phoneValidator,
  userTypeValidator, otpValidator, requiredNumber, requiredNumberOptional, motorNameValidator, hpValidator,
  aliasStarterNameValidator, starterBoxTitleValidator, macAddressValidator, serialNoValidator, pcbNumberValidator,
  starterNumberValidator, pcbOrSerialNumberValidator
};

