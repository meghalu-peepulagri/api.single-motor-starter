import { LogType, LOG_COLORS, LogLevel } from "../constants/log-types.js";
import fs from "fs";
import path from "path";

class Logger {
  private logLevel: LogLevel;
  private logsDir: string;
  private enableFileLogging: boolean;

  constructor() {
    // Set log level from environment or default to INFO
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    this.logLevel = LogLevel[envLogLevel as keyof typeof LogLevel] ?? LogLevel.INFO;

    // File logging configuration
    this.enableFileLogging = process.env.ENABLE_FILE_LOGGING !== "false"; // Enabled by default
    this.logsDir = path.join(process.cwd(), "logs");

    // Create logs directory if it doesn't exist
    if (this.enableFileLogging && !fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString();
  }

  private getLogFileName(): string {
    const now = new Date();
    const date = now.toISOString().split("T")[0]; // YYYY-MM-DD
    return `idhara-${date}.log`;
  }

  private formatMessage(type: LogType, message: string, context?: any): string {
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

  private formatMessageForFile(type: LogType, message: string, context?: any): string {
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

  private writeToFile(logEntry: string): void {
    if (!this.enableFileLogging) return;

    try {
      const logFile = path.join(this.logsDir, this.getLogFileName());
      fs.appendFileSync(logFile, logEntry + "\n", "utf8");
    } catch (error) {
      // Fallback to console if file writing fails
      console.error("Failed to write to log file:", error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private log(type: LogType, level: LogLevel, message: string, context?: any): void {
    if (!this.shouldLog(level)) return;

    const consoleMessage = this.formatMessage(type, message, context);
    const fileMessage = this.formatMessageForFile(type, message, context);

    // Write to console
    if (level === LogLevel.ERROR) {
      console.error(consoleMessage);
    } else {
      console.log(consoleMessage);
    }

    // Write to file
    this.writeToFile(fileMessage);
  }

  info(message: string, context?: any): void {
    this.log(LogType.INFO, LogLevel.INFO, message, context);
  }

  error(message: string, error?: Error | any, context?: any): void {
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
      } else if (typeof error === "object") {
        errorContext = { ...context, ...error };
      } else {
        errorContext = { ...context, error };
      }
    }

    this.log(LogType.ERROR, LogLevel.ERROR, message, errorContext);
  }

  warn(message: string, context?: any): void {
    this.log(LogType.WARN, LogLevel.WARN, message, context);
  }

  debug(message: string, context?: any): void {
    this.log(LogType.DEBUG, LogLevel.DEBUG, message, context);
  }

  mqtt(message: string, context?: any): void {
    this.log(LogType.MQTT, LogLevel.INFO, message, context);
  }

  database(message: string, context?: any): void {
    this.log(LogType.DATABASE, LogLevel.INFO, message, context);
  }

  api(message: string, context?: any): void {
    this.log(LogType.API, LogLevel.INFO, message, context);
  }
}

// Export singleton instance
export const logger = new Logger();
