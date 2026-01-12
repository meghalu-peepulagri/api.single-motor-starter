export enum LogType {
  INFO = "INFO",
  ERROR = "ERROR",
  WARN = "WARN",
  DEBUG = "DEBUG",
  MQTT = "MQTT",
  DATABASE = "DATABASE",
  API = "API",
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export const LOG_COLORS = {
  [LogType.INFO]: "\x1b[36m",      // Cyan
  [LogType.ERROR]: "\x1b[31m",     // Red
  [LogType.WARN]: "\x1b[33m",      // Yellow
  [LogType.DEBUG]: "\x1b[35m",     // Magenta
  [LogType.MQTT]: "\x1b[32m",      // Green
  [LogType.DATABASE]: "\x1b[34m",  // Blue
  [LogType.API]: "\x1b[36m",       // Cyan
  RESET: "\x1b[0m",
  BRIGHT: "\x1b[1m",
  DIM: "\x1b[2m",
};
