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
    "unique_phone_idx": "Mobile Number already exist.",
    "unique_location_per_user": "Location name already exist.",
    "unique_field_per_user_location": "Field name already exist.",
    "validate_mac_address": "MAC address already exist.",
    "validate_pcb_number": "PCB number already exist.",
    "valid_starter_box_name": "Name already exist.",
    "validate_starter_number": "Starter Number already exist.",
    "unique_motor_alias_name_per_location": "Pump name already exist.",
};
export const FOREIGN_KEY_MESSAGES = {
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
export const STARTER_BOX_VALIDATION_CRITERIA = "Starter Box details provided do not meet the required validation criteria";
export const CREATE_MOTOR_SCHEDULE_VALIDATION_CRITERIA = "Create motor schedule details provided do not meet the required validation criteria";
export const REPLACE_STARTER_BOX_VALIDATION_CRITERIA = "Replace starter box details provided do not meet the required validation criteria";
export const UPDATE_DEFAULT_SETTINGS_VALIDATION_CRITERIA = "Update default settings details provided do not meet the required validation criteria";
export const INSERT_STARTER_SETTINGS_VALIDATION_CRITERIA = "Insert starter settings details provided do not meet the required validation criteria";
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
export const NAME_REQUIRED = "Full Name is required";
export const VALID_NAME = "Name should contain characters only";
export const LOGIN_DONE = "Login successfully";
export const LOGOUT_DONE = "Logout successfully";
export const INVALID_CREDENTIALS = "Invalid credentials";
export const USER_ID_REQUIRED = "User is required";
export const USER_NOT_FOUND = "User not found";
export const INCORRECT_PASSWORD = "Incorrect password";
export const EMAIL_ID_REQUIRED = "Email ID is required";
export const INVALID_EMAIL_ID = "Invalid Email ID";
export const USER_UPDATED = "User details updated successfully";
export const USER_DELETED = "User deleted successfully";
export const INVALID_PHONE = "Invalid Mobile Number";
export const EMAIL_REQUIRED = "Email is required";
export const PASSWORD_REQUIRED = "Password is required";
export const INVALID_PASSWORD = "Invalid password";
export const VALID_MAIL = "Invalid email";
export const PHONE_NUMBER_REQUIRED = "Mobile Number is required";
export const ALTERNATE_PHONE_NUMBER_REQUIRED = "Alternate phone number is required";
export const INVALID_PHONE_NUMBER = "Invalid Mobile Number(digits only)";
export const INVALID_PHONE_NUMBER_VALID_LENGTH = "Invalid Mobile Number (10 digits required)";
export const PASSWORD_MIN_LENGTH = "Password should be min 6 characters";
export const PASSWORD_SHOULD_CONTAIN = "Password must contain at least one letter and one number";
export const NAME_MIN_LENGTH = "Full Name should be min 3 characters";
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
export const REFEREED_BY_REQUIRED = "Refereed by is invalid";
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
export const LOCATION_FETCHED = "Location fetched successfully";
export const LOCATIONS_FETCHED = "Locations fetched successfully";
export const LOCATION_UPDATED = "Location updated successfully";
export const LOCATION_DELETED = "Location deleted successfully";
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
export const MOTOR_NAME = "Pump name must be string";
export const MOTOR_REQUIRED = "Pump name is required";
export const MOTOR_NAME_STARTS_LETTER = "Pump name starts with letter";
export const MOTOR_MIN_LENGTH = "Pump name has min 3 characters";
export const MOTOR_NOT_FOUND = "Pump not found";
export const MOTOR_ADDED = "Pump added successfully";
export const MOTOR_UPDATED = "Pump renamed successfully";
export const MOTOR_DELETED = "Pump deleted successfully";
export const HP_REQUIRED = "HP is required";
export const HP_MIN = "HP should be min 1";
export const HP_MAX = "HP should be max 30";
export const SIMILAR_MOTOR_TITLE_NOT_ALLOWED = "Duplicate pump titles are not allowed";
export const MOTOR_ID_REQUIRED = "Pump is required";
export const MOTOR_DETAILS_FETCHED = "Pump details fetched successfully";
export const MOTOR_NAME_EXISTED = "Pump name already exist";
// Starter Box
export const STARTER_BOX_ADDED_SUCCESSFULLY = "Device box added successfully";
export const STARTER_BOX_UPDATED_SUCCESSFULLY = "Device box updated successfully";
export const STARTER_BOX_DELETED_SUCCESSFULLY = "Device deleted successfully";
export const STARTER_REMOVED_SUCCESS = "Device removed successfully";
export const STARTER_BOX_REQUIRED = "Device is required";
export const STARTER_BOX_NOT_FOUND = "Device not found";
export const STARTER_BOX_ID_REQUIRED = "Device box id is required";
export const STARTER_BOX_DETAILS_FETCHED = "Device box details fetched successfully";
export const DEVICE_NAME_REQUIRED = "Name is required";
export const DEVICE_ID_REQUIRED = "Device is required";
export const POND_REQUIRED = "Pond is required";
export const DEVICE_FETCH_SUCCESS = "Device fetched successfully";
export const DEVICE_NAME_UPDATED = "Device name updated successfully";
export const DEVICE_NOT_FOUND = "Device not found";
export const POND_NOT_FOUND = "Pond not found";
export const DEVICE_VITALS_SEND_SUCCESSFULLY = "Device vitals data send successfully";
export const ACTIVE_ENERGY_RESET_SUCCESSFULLY = "Device active energy reset successfully";
export const DEVICE_PROTECTION_APPLIED = "Device voltage protection applied successfully";
export const DEVICE_CURRENT_PROTECTION_APPLIED = "Device current protection applied successfully";
export const PHASE_PROTECTION_APPLIED = "Phase protection applied successfully";
export const DEVICE_PROTECTION = "Device protection applied successfully";
export const DEVICE_ALERTS = "Device alerts processed successfully";
export const UNDER_VOLTAGE_REQUIRED = "Under voltage is required";
export const OVER_VOLTAGE_REQUIRED = "Over voltage is required";
export const OVER_LOAD_REQUIRED = "Over load is required";
export const DRY_RUN_REQUIRED = "Dry run is required";
export const INVALID_PHASE_ABSENT = "Invalid phase absent";
export const INVALID_PHASE_REVERSAL = "Invalid phase reversal";
export const INVALID_State = "Invalid state";
export const ALERT_TYPE_REQUIRED = "Alert type is required";
export const DEVICE_NAME = "Device name must be string";
export const DEVICE_ID = "Device id must be string";
export const DEVICE_LIST = "Device list fetches successfully";
export const DEVICE_MIN_LEN = "Name has min 3 characters";
export const SERIAL_NO_MIN_LEN = "MCU Serial Number has min 3 characters";
export const MCU_MIN_LEN = "MCU Number has min 3 characters";
export const PCB_MIN_LEN = "PCB Number has min 3 characters";
export const STARTER_NUMBER_MIN_LEN = "Starter Number has min 3 characters";
export const DEVICE_NAME_STARTS_LETTER = "Name starts with Character";
export const MAC_STRING = "Unique Id must be a string";
export const MAC_REQUIRED = "Unique Id is required";
export const MAC_MIN_LEN = "Unique Id has min 3 characters";
export const SERIAL_NO_REQUIRED = "MCU Serial Number is required";
export const PCB_NUMBER_REQUIRED = "PCB Number is required";
export const STARTER_NUMBER_REQUIRED = "Starter Number is required";
export const SMALL_LETTERS_NOT_ALLOWED = "Small characters not allowed";
export const STARTER_ASSIGNED_SUCCESSFULLY = "Device assigned successfully";
export const STARTER_ALREADY_ASSIGNED = "Device already assigned";
export const STARER_NOT_DEPLOYED = "Device not deployed yet";
export const STARTER_LIST_FETCHED = "Device fetches successfully";
export const STARTER_REPLACED_SUCCESSFULLY = "Device location updated successfully";
export const STARTER_RUNTIME_FETCHED = "Run time fetches successfully";
export const DEVICE_ANALYTICS_FETCHED = "Device analytics fetches successfully";
export const DEPLOYED_STATUS = ["READY", "DEPLOYED", "TEST", "ASSIGNED"];
export const DEPLOYED_STATUS_UPDATED = "Deployed status updated successfully";
export const STARTER_CONNECTED_MOTORS_FETCHED = "Device connected Pumps fetched successfully";
export const LOCATION_ASSIGNED = "Location assigned successfully";
export const LOCATION_ID_REQUIRED = "Location is required";
export const STARTER_DETAILS_UPDATED = "Device details updated successfully";
export const STARTER_BOX_STATUS_UPDATED = "Device status updated successfully";
export const PCB_SERIAL_NUMBER_REQUIRED = "PCB/Serial Number is required";
export const MIN_3_CHARACTERS_REQUIRED = "Min has 3 characters";
export const LATEST_PCB_NUMBER_FETCHED_SUCCESSFULLY = "Latest PCB number fetched successfully";
// Gateway 
export const GATEWAY_REQUIRED = "Gateway is required";
export const GATEWAY_NOT_FOUND = "Gateway not found";
// Motor schedule 
export const SCHEDULE_TYPES = ["ONE_TIME", "DAILY", "WEEKLY"];
export const SCHEDULED_CREATED = "Motor schedule created successfully";
export const ALREADY_SCHEDULED_EXISTS = "Schedule already exists with a motor same type & time";
export const SCHEDULE_TYPE_IS_REQUIRED = "Schedule type is required";
export const INVALID_SCHEDULED_TYPE = "Invalid schedule type";
export const SCHEDULE_DATE_REQUIRED = "Schedule date is required";
export const SCHEDULE_DATE_FORMAT = "Schedule date must be in YYYY-MM-DD format";
export const SCHEDULE_START_TIME_REQUIRED = "Start time is required";
export const SCHEDULE_START_TIME_INVALID = "Invalid start time";
export const SCHEDULE_END_TIME_REQUIRED = "End time is required";
export const SCHEDULE_END_TIME_INVALID = "Invalid end time";
export const INVALID_DAYS_WEEK = "Invalid day of week";
export const SCHEDULED_LIST_FETCHED = "Motor scheduled list fetches successfully";
export const SCHEDULE_UPDATED = "Motor Schedule updated successfully";
export const SCHEDULE_NOT_FOUND = "Motor schedule id not found";
export const SCHEDULE_DELETED = "Motor Schedule deleted successfully";
export const SCHEDULE_STATUS = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "PAUSED", "CANCELLED", "RESCHEDULED"];
export const INVALID_SCHEDULED_STATUS = "Invalid schedule status";
export const SCHEDULE_STATUS_DAILY_WEEKLY = ["DAILY", "WEEKLY"];
export const All_USER_TYPES = ["OWNER", "MANAGER", "SUPERVISOR", "USER"];
export const ALL_ADMIN_TYPES = ["ADMIN", "SUPER_ADMIN"];
export const ALL_WRITE_TYPES = ["OWNER", "MANAGER"];
export const ALL_WRITE_READ_TYPES = ["OWNER", "MANAGER", "SUPERVISOR", "USER"];
export const MOTORS_ARRAY_REQUIRED = "Motors must be a non-empty array of motors with starter IDs.";
// Settings
export const DEFAULT_SETTINGS_FETCHED = "Default settings fetched successfully";
export const DEFAULT_SETTINGS_UPDATED = "Default settings updated successfully";
export const DEFAULT_SETTINGS_NOT_FOUND = "Default settings not found";
export const SETTINGS_FETCHED = "Settings details fetched successfully";
export const ADDED_STARTER_SETTINGS = "Starter settings updated successfully";
export const SETTINGS_FIELD_NAMES = {
    /* ================= dvc_cnfg ================= */
    dvc_flt_en: "Faults enable",
    dvc_flc: "Full load current",
    dvc_st: "Seed time",
    dvc_flt_ipf: "Input phase failure fault threshold",
    dvc_flt_lvf: "Low voltage fault threshold",
    dvc_flt_hvf: "High voltage fault threshold",
    dvc_flt_vif: "Voltage imbalance fault threshold",
    dvc_flt_paminf: "Minimum phase angle for fault",
    dvc_flt_pamaxf: "Maximum phase angle for fault",
    dvc_alt_pfa: "Phase failure alert value",
    dvc_alt_lva: "Low voltage alert value",
    dvc_alt_hva: "High voltage alert value",
    dvc_alt_via: "Voltage imbalance alert value",
    dvc_alt_pamina: "Minimum phase angle alert value",
    dvc_alt_pamaxa: "Maximum phase angle alert value",
    dvc_rec_lvr: "Low voltage recovery threshold",
    dvc_rec_hvr: "High voltage recovery threshold",
    /* ================= mtr_cnfg ================= */
    mtr_flt_dr: "Dry run protection fault threshold",
    mtr_flt_ol: "Overload fault threshold",
    mtr_flt_lr: "Locked rotor fault threshold",
    mtr_flt_opf: "Output phase failure",
    mtr_flt_ci: "Current imbalance fault ratio",
    mtr_alt_dr: "Dry run protection alert threshold",
    mtr_alt_ol: "Overload alert threshold",
    mtr_alt_lr: "Locked rotor alert threshold",
    mtr_alt_ci: "Current imbalance alert ratio",
    mtr_rec_ol: "Overload recovery threshold",
    mtr_rec_lr: "Locked rotor recovery threshold",
    mtr_rec_ci: "Current imbalance recovery ratio",
    /* ================= atml_cnfg ================= */
    atml_ug_r: "U gain R for Atmel calibration",
    atml_ug_y: "U gain Y for Atmel calibration",
    atml_ug_b: "U gain B for Atmel calibration",
    atml_ig_r: "I gain R for Atmel calibration",
    atml_ig_y: "I gain Y for Atmel calibration",
    atml_ig_b: "I gain B for Atmel calibration",
    /* ================= mqt_cnfg ================= */
    mqt_ca_fn: "CA certificate filename",
    mqt_bkr_adrs: "MQTT broker address",
    mqt_c_id: "MQTT client ID",
    mqt_emqx_usrn: "EMQX server username",
    mqt_emqx_pswd: "EMQX server password",
    mqt_prod_http: "Production server HTTP URL",
    mqt_bkp_http: "Backup server HTTP URL",
    mqt_bkr_port: "MQTT broker port",
    mqt_ce_len: "CA certificate length",
    /* ================= ivrs_cnfg ================= */
    ivrs_sms_pswd: "SMS password",
    ivrs_c_lang: "Current language",
    ivrs_auth_num: "Authorized numbers list",
    /* ================= frq_cnfg ================= */
    frq_dft_liv_f: "Default live data frequency",
    frq_h_liv_f: "High priority payload frequency",
    frq_m_liv_f: "Medium priority payload frequency",
    frq_l_liv_f: "Low priority payload frequency",
    frq_pwr_info_f: "Power info payload frequency",
    /* ================= feats_en ================= */
    feats_ivrs_en: "IVRS feature enable",
    feats_sms_en: "SMS feature enable",
    feats_rmt_en: "Remote feature enable",
    /* ================= flt_en ================= */
    flt_en_ipf: "Input phase failure fault enable",
    flt_en_lvf: "Low voltage fault enable",
    flt_en_hvf: "High voltage fault enable",
    flt_en_vif: "Voltage imbalance fault enable",
    flt_en_dr: "Dry run protection fault enable",
    flt_en_ol: "Overload fault enable",
    flt_en_lr: "Locked rotor fault enable",
    flt_en_opf: "Output phase failure fault enable",
    flt_en_ci: "Current imbalance fault enable",
};
export const DEVICE_SCHEMA = {
    dvc_cnfg: {
        flt_en: "dvc_flt_en",
        flc: "dvc_flc",
        st: "dvc_st",
        flt: {
            ipf: "dvc_flt_ipf",
            lvf: "dvc_flt_lvf",
            hvf: "dvc_flt_hvf",
            vif: "dvc_flt_vif",
            paminf: "dvc_flt_paminf",
            pamaxf: "dvc_flt_pamaxf",
        },
        alt: {
            pfa: "dvc_alt_pfa",
            lva: "dvc_alt_lva",
            hva: "dvc_alt_hva",
            via: "dvc_alt_via",
            pamina: "dvc_alt_pamina",
            pamaxa: "dvc_alt_pamaxa",
        },
        rec: {
            lvr: "dvc_rec_lvr",
            hvr: "dvc_rec_hvr",
        },
    },
    mtr_cnfg: {
        flt: {
            dr: "mtr_flt_dr",
            ol: "mtr_flt_ol",
            lr: "mtr_flt_lr",
            opf: "mtr_flt_opf",
            ci: "mtr_flt_ci",
        },
        alt: {
            dr: "mtr_alt_dr",
            ol: "mtr_alt_ol",
            lr: "mtr_alt_lr",
            ci: "mtr_alt_ci",
        },
        rec: {
            ol: "mtr_rec_ol",
            lr: "mtr_rec_lr",
            ci: "mtr_rec_ci",
        },
    },
    atml_cnfg: {
        sn: "atml_sn",
        ug_r: "atml_ug_r",
        ug_y: "atml_ug_y",
        ug_b: "atml_ug_b",
        ig_r: "atml_ig_r",
        ig_y: "atml_ig_y",
        ig_b: "atml_ig_b",
    },
    mqt_cnfg: {
        ca_fn: "mqt_ca_fn",
        bkr_adrs: "mqt_bkr_adrs",
        c_id: "mqt_c_id",
        emqx_usrn: "mqt_emqx_usrn",
        emqx_pswd: "mqt_emqx_pswd",
        prod_http: "mqt_prod_http",
        bkp_http: "mqt_bkp_http",
        mqtt_c_indx: "mqt_mqtt_c_indx",
        k_alive_t: "mqt_k_alive_t",
        bkr_port: "mqt_bkr_port",
        ce_len: "mqt_ce_len",
    },
    ivrs_info: {
        sms_pswd: "ivrs_sms_pswd",
        c_lang: "ivrs_c_lang",
        auth_num: "ivrs_auth_num",
    },
    frq_cnfg: {
        dft_liv_f: "frq_dft_liv_f",
        h_liv_f: "frq_h_liv_f",
        m_liv_f: "frq_m_liv_f",
        l_liv_f: "frq_l_liv_f",
        pwr_info_f: "frq_pwr_info_f",
    },
    feats_en: {
        ivrs_en: "feats_ivrs_en",
        sms_en: "feats_sms_en",
        rmt_en: "feats_rmt_en",
    },
    flt_en: {
        ipf: "flt_en_ipf",
        lvf: "flt_en_lvf",
        hvf: "flt_en_hvf",
        vif: "flt_en_vif",
        dr: "flt_en_dr",
        ol: "flt_en_ol",
        lr: "flt_en_lr",
        opf: "flt_en_opf",
        ci: "flt_en_ci",
    },
};
