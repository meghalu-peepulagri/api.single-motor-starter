import { LogType, LOG_COLORS, LogLevel } from "../constants/log-types.js";
import fs from "fs";
import path from "path";
class Logger {
    logLevel;
    logsDir;
    enableFileLogging;
    constructor() {
        // Set log level from environment or default to INFO
        const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
        this.logLevel = LogLevel[envLogLevel] ?? LogLevel.INFO;
        // File logging configuration
        this.enableFileLogging = process.env.ENABLE_FILE_LOGGING !== "false"; // Enabled by default
        this.logsDir = path.join(process.cwd(), "logs");
        // Create logs directory if it doesn't exist
        if (this.enableFileLogging && !fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }
    }
    formatTimestamp() {
        const now = new Date();
        return now.toISOString();
    }
    getLogFileName() {
        const now = new Date();
        const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
        return `idhara-${date}.log`;
    }
    formatMessage(type, message, context) {
        const timestamp = this.formatTimestamp();
        const color = LOG_COLORS[type];
        const reset = LOG_COLORS.RESET;
        const bright = LOG_COLORS.BRIGHT;
        const dim = LOG_COLORS.DIM;
        let formattedMessage = `${dim}${timestamp}${reset} ${bright}${color}[${type}]${reset} ${message}`;
        if (context !== undefined && context !== null) {
            const contextStr = typeof context === "object"
                ? JSON.stringify(context, null, 2)
                : String(context);
            formattedMessage += `\n${dim}Context:${reset} ${contextStr}`;
        }
        return formattedMessage;
    }
    formatMessageForFile(type, message, context) {
        const timestamp = this.formatTimestamp();
        let logEntry = `${timestamp} [${type}] ${message}`;
        if (context !== undefined && context !== null) {
            const contextStr = typeof context === "object"
                ? JSON.stringify(context)
                : String(context);
            logEntry += ` | Context: ${contextStr}`;
        }
        return logEntry;
    }
    writeToFile(logEntry) {
        if (!this.enableFileLogging)
            return;
        try {
            const logFile = path.join(this.logsDir, this.getLogFileName());
            fs.appendFileSync(logFile, logEntry + "\n", "utf8");
        }
        catch (error) {
            // Fallback to console if file writing fails
            console.error("Failed to write to log file:", error);
        }
    }
    shouldLog(level) {
        return level >= this.logLevel;
    }
    log(type, level, message, context) {
        if (!this.shouldLog(level))
            return;
        const consoleMessage = this.formatMessage(type, message, context);
        const fileMessage = this.formatMessageForFile(type, message, context);
        // Write to console
        if (level === LogLevel.ERROR) {
            console.error(consoleMessage);
        }
        else {
            console.log(consoleMessage);
        }
        // Write to file
        this.writeToFile(fileMessage);
    }
    info(message, context) {
        this.log(LogType.INFO, LogLevel.INFO, message, context);
    }
    error(message, error, context) {
        let errorContext = context;
        if (error) {
            if (error instanceof Error) {
                errorContext = {
                    ...context,
                    error: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name,
                    },
                };
            }
            else if (typeof error === "object") {
                errorContext = { ...context, ...error };
            }
            else {
                errorContext = { ...context, error };
            }
        }
        this.log(LogType.ERROR, LogLevel.ERROR, message, errorContext);
    }
    warn(message, context) {
        this.log(LogType.WARN, LogLevel.WARN, message, context);
    }
    debug(message, context) {
        this.log(LogType.DEBUG, LogLevel.DEBUG, message, context);
    }
    mqtt(message, context) {
        this.log(LogType.MQTT, LogLevel.INFO, message, context);
    }
    database(message, context) {
        this.log(LogType.DATABASE, LogLevel.INFO, message, context);
    }
    api(message, context) {
        this.log(LogType.API, LogLevel.INFO, message, context);
    }
}
// Export singleton instance
export const logger = new Logger();
