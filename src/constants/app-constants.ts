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
export const UNIQUE_INDEX_MESSAGES: Record<string, string> = {
  "unique_mail_idx": "Email already exist.",
  "unique_phone_idx": "Phone number already exist.",
};


// Validations
export const SIGNUP_VALIDATION_CRITERIA = "Signup details provided do not meet the required validation criteria";
export const LOGIN_VALIDATION_CRITERIA = "Login details provided do not meet the required validation criteria";

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
export const VALID_NAME = "Name should contain letters only";
export const LOGIN_DONE = "Login successful";
export const LOGOUT_DONE = "Logout successful";
export const USER_FOUND = "User found successfully";
export const INVALID_CREDENTIALS = "Invalid credentials";
export const USER_ID_REQUIRED = "User ID is required";
export const USER_NOT_FOUND = "User not found";
export const INCORRECT_PASSWORD = "Incorrect password";
export const EMAIL_ID_REQUIRED = "Email ID is required";
export const INVALID_EMAIL_ID = "Invalid Email ID";
export const USER_UPDATED = "User updated successfully";
export const USER_DELETED = "User deleted successfully";
export const UNAUTHORIZED = "Access denied: Administrator privileges required";
export const INVALID_PHONE = "Invalid phone number";
export const ACCOUNT_EXISTED = "You already have an account. Please log in";
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
export const USER_INACTIVE = "The user account is inactive";
export const PASSWORD_SHOULD_CONTAIN_UPPERCASE = "Must contain at least one uppercase character";
export const PASSWORD_SHOULD_CONTAIN_NUMBER = "Must contain at least one number";
export const PASSWORD_SPECIAL_CHAR = "Must contain at least one special character"


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








