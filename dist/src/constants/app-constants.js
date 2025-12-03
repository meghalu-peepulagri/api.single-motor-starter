export const DEF_422 = "Validation Failed";
export const DEF_404 = "Data Not Found";
export const DEF_409 = "Data Conflict Encountered";
export const DEF_401 = "Unauthorized Request";
export const DEF_403 = "Forbidden Request";
export const DEF_400 = "Bad Request";
export const DEF_502 = "Bad Gateway";
export const DEF_503 = "Service Unavailable";
export const DEF_429 = "Too many requests";
export const DEF_408 = "Request Timeout";
export const DEF_500 = "Internal Server Error";
export const NAME_422 = "Unprocessable Entity";
export const NAME_404 = "Not Found";
export const NAME_409 = "Conflict";
export const NAME_401 = "Unauthorized";
export const NAME_403 = "Forbidden";
export const NAME_400 = "Bad Request";
export const NAME_502 = "Bad Gateway";
export const NAME_503 = "Service Unavailable";
export const NAME_429 = "Too many requests";
export const NAME_408 = "Request Timeout";
export const NAME_500 = "Internal Server Error";
export const SERVICE_UP = "Service is up and running";
// Unique constraint messages
export const UNIQUE_INDEX_MESSAGES = {
    "unique_mail_idx": "Email already exist.",
    "unique_phone_idx": "Phone number already exist.",
    "unique_location_per_user": "Location name already exist.",
    "unique_field_per_user_location": "Field name already exist.",
    "unique_motor_per_field": "Motor name already exist.",
};
export const FOREGIN_KEY_MESSAGES = {
    "locations_user_id_users_id_fk": "User not found.",
    "users_created_by_users_id_fk": "User not found.",
    "fields_location_id_locations_id_fk": "Location not found.",
};
// Validations
export const SIGNUP_VALIDATION_CRITERIA = "Signup details provided do not meet the required validation criteria";
export const LOGIN_VALIDATION_CRITERIA = "Login details provided do not meet the required validation criteria";
export const LOCATION_VALIDATION_CRITERIA = "Location details provided do not meet the required validation criteria";
export const USER_UPDATE_VALIDATION_CRITERIA = "User update details provided do not meet the required validation criteria";
export const VERIFY_OTP_VALIDATION_CRITERIA = "Verify OTP details provided do not meet the required validation criteria";
export const FIELD_VALIDATION_CRITERIA = "Field details provided do not meet the required validation criteria";
export const MOTOR_VALIDATION_CRITERIA = "Motor details provided do not meet the required validation criteria";
// Database
export const DB_RECORD_NOT_FOUND = "Database record not found";
export const DB_SAVE_DATA_FAILED = "Failed to save data in database";
export const DB_UPDATE_DATA_FAILED = "Failed to update data in database";
export const EMPTY_DB_DATA = "Empty data to save in database";
export const DB_ID_INVALID = "Invalid database ID";
// Users
export const ADDRESS_STRING = "Address must be a string";
export const EMAIL_EXISTED = "Email already";
export const USER_CREATED = "User created successfully";
export const NAME_REQUIRED = "Name is required";
export const VALID_NAME = "Name should contain characters only";
export const LOGIN_DONE = "Login successfully";
export const LOGOUT_DONE = "Logout successfully";
export const INVALID_CREDENTIALS = "Invalid credentials";
export const USER_ID_REQUIRED = "User ID is required";
export const USER_NOT_FOUND = "User not found";
export const INCORRECT_PASSWORD = "Incorrect password";
export const EMAIL_ID_REQUIRED = "Email ID is required";
export const INVALID_EMAIL_ID = "Invalid Email ID";
export const USER_UPDATED = "User details updated successfully";
export const USER_DELETED = "User deleted successfully";
export const INVALID_PHONE = "Invalid phone number";
export const EMAIL_REQUIRED = "Email is required";
export const PASSWORD_REQUIRED = "Password is required";
export const INVALID_PASSWORD = "Invalid password";
export const PHONE_INVALID_FORMAT = "Enter a valid phone number";
export const VALID_MAIL = "Invalid email";
export const PHONE_NUMBER_REQUIRED = "Phone number is required";
export const ALTERNATE_PHONE_NUMBER_REQUIRED = "Alternate phone number is required";
export const INVALID_PHONE_NUMBER = "Invalid phone number(digits only)";
export const INVALID_PHONE_NUMBER_VALID_LENGTH = "Invalid phone number (10 digits required)";
export const PASSWORD_MIN_LENGTH = "Password should be min 6 characters";
export const PASSWORD_SHOULD_CONTAIN = "Password must contain at least one letter and one number";
export const NAME_MIN_LENGTH = "Name should be min 3 characters";
export const USER_TYPE_REQUIRED = "User type is required";
export const USER_TYPE_INVALID = "Invalid user type";
export const PASSWORD_SHOULD_CONTAIN_UPPERCASE = "Must contain at least one uppercase character";
export const PASSWORD_SHOULD_CONTAIN_NUMBER = "Must contain at least one number";
export const PASSWORD_SPECIAL_CHAR = "Must contain at least one special character";
export const USERS_LIST = "Users list fetched successfully";
export const INVALID_USER_ID = "Invalid user ID";
export const USER_DETAILS_FETCHED = "User details fetched successfully";
export const USER_ACTIVITIES = "User activities fetched successfully";
export const USER_NOT_EXIST_WITH_PHONE = "User not registered with this number";
export const USER_LOGIN = "Login successfully";
export const USER_LOGOUT = "Logout successfully";
// Token
export const TOKEN_REQUIRED = "Access token is required";
export const TOKEN_EXPIRED = "Session is expired";
export const TOKEN_SIGNATURE_MISMATCH = "Access token signature mismatch";
export const REFRESH_TOKEN_INVALID = "Invalid refresh token";
export const TOKENS_GENERATED = "Successfully generated tokens";
export const REFRESH_TOKEN_REQUIRED = "refresh token required";
export const INVALID_REFRESH_TOKEN = "Invalid refresh token";
export const DEVICE_TOKEN_REQUIRED = "Device token is required";
export const INVALID_DEVICE_TOKEN = "Invalid device token";
// MQTT BROKER
export const MQTT_BROKER_URL = "MQTT broker url";
export const MQTT_USER_NAME = "MQTT username";
export const MQTT_PASSWORD = "MQTT password";
export const MQTT_ERROR = "MQTT connection error";
export const NO_MQTT_TOPIC = "No matching topic handler found";
export const MQTT_CLIENT_NOT_CONNECTED = "MQTT client is not connected. Cannot publish";
export const MQTT_PUB_SUCCESS = "Message published successfully";
export const MQTT_DISCONNECTED = "MQTT client disconnected";
export const MQTT_NOT_CONNECTED = "MQTT client is not connected";
export const NO_TOPIC_GRANTED = "No topics were granted during subscription";
export const SUB_MQTT_CLIENT_NOT_CONNECTED = "Cannot subscribe, MQTT client is not connected";
// location validations
export const LOCATION_NAME_REQUIRED = "Location name is required";
export const TITLE_MUST_BE_STRING = "Location name must be a string";
export const TITLE_REQUIRED = "Location name is required";
export const LOCATION_NAME_MIN_LEN = "Location name should be min 3 characters";
export const LOCATION_NAME_INVALID = "Location name should contain characters only";
// Locations constants messages
export const LOCATION_NOT_FOUND = "Location not found";
export const LOCATION_ADDED = "Location added successfully";
export const LOCATION_REQUIRED = "Location is required";
// OTP
export const INVALID_OTP = "Invalid OTP";
export const OTP_SENT = "OTP sent successfully";
export const OTP_VERIFIED = "OTP verified successfully";
export const OTP_REQUIRED = "OTP is required";
export const INVALID_OTP_LENGTH = "Please enter a 4-digit OTP";
// id validators 
export const ID_REQUIRED = "Id is required";
export const ID_NUMBER = "Id must be a number";
export const ID_INVALID = "Invalid Id";
// Fields 
export const FIELDS_FETCHED = "Fields fetched successfully";
export const FIELD_REQUIRED = "Field is required";
export const FIELD_NOT_FOUND = "Field not found";
export const FIELD_ADDED = "Field added successfully";
export const FIELD_UPDATED = "Field updated successfully";
export const FIELD_DELETED = "Field deleted successfully";
export const FIELD_NAME_REQUIRED = "Field name is required";
export const ACRES_REQUIRED = "Acres is required";
export const FIELD_NAME_MUST_STRING = "Field name must be a string";
export const FIELD_NAME_MIN_LEN = "Field name should be min 3 characters";
export const FIELD_NAME_INVALID = "Field name should contain characters only";
// Motors 
export const MOTOR_NAME = "Motor name must be string";
export const MOTOR_REQUIRED = "Motor name is required";
export const MOTOR_NAME_STARTS_LETTER = "Motor name starts with letter";
export const MOTOR_MIN_LENGTH = "Motor name has min 3 characters";
export const MOTOR_NOT_FOUND = "Motor not found";
export const MOTOR_ADDED = "Motor added successfully";
export const MOTOR_UPDATED = "Motor updated successfully";
export const MOTOR_DELETED = "Motor deleted successfully";
export const HP_REQUIRED = "HP is required";
export const HP_MIN = "HP should be min 1";
export const HP_MAX = "HP should be max 30";
export const SIMILAR_MOTOR_TITLE_NOT_ALLOWED = "Duplicate motor titles are not allowed";
export const MOTOR_ID_REQUIRED = "Motor Id is required";
export const MOTOR_DETAILS_FETCHED = "Motor details fetched successfully";
