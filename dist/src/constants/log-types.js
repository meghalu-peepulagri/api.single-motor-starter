export var LogType;
(function (LogType) {
    LogType["INFO"] = "INFO";
    LogType["ERROR"] = "ERROR";
    LogType["WARN"] = "WARN";
    LogType["DEBUG"] = "DEBUG";
    LogType["MQTT"] = "MQTT";
    LogType["DATABASE"] = "DATABASE";
    LogType["API"] = "API";
})(LogType || (LogType = {}));
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["NONE"] = 4] = "NONE";
})(LogLevel || (LogLevel = {}));
export const LOG_COLORS = {
    [LogType.INFO]: "\x1b[36m", // Cyan
    [LogType.ERROR]: "\x1b[31m", // Red
    [LogType.WARN]: "\x1b[33m", // Yellow
    [LogType.DEBUG]: "\x1b[35m", // Magenta
    [LogType.MQTT]: "\x1b[32m", // Green
    [LogType.DATABASE]: "\x1b[34m", // Blue
    [LogType.API]: "\x1b[36m", // Cyan
    RESET: "\x1b[0m",
    BRIGHT: "\x1b[1m",
    DIM: "\x1b[2m",
};
