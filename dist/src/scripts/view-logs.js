#!/usr/bin/env node
/**
 * Log Viewer CLI Tool
 *
 * Usage:
 *   npm run logs                    # View all logs from today
 *   npm run logs -- --date 2026-01-12  # View logs from specific date
 *   npm run logs -- --type MQTT     # Filter by log type
 *   npm run logs -- --search "error" # Search for keyword
 *   npm run logs -- --tail 50       # Show last 50 lines
 *   npm run logs -- --type ERROR --search "database" # Combine filters
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ANSI color codes
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
};
// Log type colors
const typeColors = {
    INFO: colors.cyan,
    ERROR: colors.red,
    WARN: colors.yellow,
    DEBUG: colors.magenta,
    MQTT: colors.green,
    DATABASE: colors.blue,
    API: colors.cyan,
};
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--date" && args[i + 1]) {
            options.date = args[++i];
        }
        else if (arg === "--type" && args[i + 1]) {
            options.type = args[++i].toUpperCase();
        }
        else if (arg === "--search" && args[i + 1]) {
            options.search = args[++i];
        }
        else if (arg === "--tail" && args[i + 1]) {
            options.tail = parseInt(args[++i], 10);
        }
        else if (arg === "--all") {
            options.all = true;
        }
        else if (arg === "--help" || arg === "-h") {
            showHelp();
            process.exit(0);
        }
    }
    return options;
}
function showHelp() {
    console.log(`
${colors.bright}Log Viewer - View and filter application logs${colors.reset}

${colors.bright}Usage:${colors.reset}
  npm run logs [options]

${colors.bright}Options:${colors.reset}
  --date <YYYY-MM-DD>    View logs from specific date (default: today)
  --type <TYPE>          Filter by log type (INFO, ERROR, WARN, DEBUG, MQTT, DATABASE, API)
  --search <keyword>     Search for keyword in logs (case-insensitive)
  --tail <number>        Show last N lines
  --all                  Show all log files
  --help, -h             Show this help message

${colors.bright}Examples:${colors.reset}
  npm run logs                              # View today's logs
  npm run logs -- --date 2026-01-12         # View logs from specific date
  npm run logs -- --type MQTT               # Show only MQTT logs
  npm run logs -- --search "connection"     # Search for "connection"
  npm run logs -- --tail 50                 # Show last 50 lines
  npm run logs -- --type ERROR --search db  # Combine filters
  npm run logs -- --all                     # List all available log files
`);
}
function getLogsDir() {
    return path.join(process.cwd(), "logs");
}
function getLogFileName(date) {
    return `idhara-${date}.log`;
}
function getTodayDate() {
    return new Date().toISOString().split("T")[0];
}
function listAllLogFiles() {
    const logsDir = getLogsDir();
    if (!fs.existsSync(logsDir)) {
        console.log(`${colors.yellow}No logs directory found. Logs will be created when the server runs.${colors.reset}`);
        return;
    }
    const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith(".log"))
        .sort()
        .reverse();
    if (files.length === 0) {
        console.log(`${colors.yellow}No log files found.${colors.reset}`);
        return;
    }
    console.log(`\n${colors.bright}Available log files:${colors.reset}\n`);
    files.forEach(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        console.log(`  ${colors.cyan}${file}${colors.reset} (${sizeKB} KB)`);
    });
    console.log(`\n${colors.dim}Use --date to view a specific log file${colors.reset}\n`);
}
function colorizeLogLine(line) {
    // Extract log type from line
    const typeMatch = line.match(/\[(INFO|ERROR|WARN|DEBUG|MQTT|DATABASE|API)\]/);
    if (!typeMatch)
        return line;
    const type = typeMatch[1];
    const color = typeColors[type] || colors.reset;
    // Colorize the log type
    return line.replace(`[${type}]`, `${colors.bright}${color}[${type}]${colors.reset}`);
}
function filterLogs(lines, options) {
    let filtered = lines;
    // Filter by type
    if (options.type) {
        filtered = filtered.filter(line => line.includes(`[${options.type}]`));
    }
    // Filter by search keyword
    if (options.search) {
        const searchLower = options.search.toLowerCase();
        filtered = filtered.filter(line => line.toLowerCase().includes(searchLower));
    }
    // Apply tail
    if (options.tail && options.tail > 0) {
        filtered = filtered.slice(-options.tail);
    }
    return filtered;
}
function viewLogs(options) {
    const logsDir = getLogsDir();
    if (!fs.existsSync(logsDir)) {
        console.log(`${colors.yellow}No logs directory found. Logs will be created when the server runs.${colors.reset}`);
        return;
    }
    const date = options.date || getTodayDate();
    const logFile = path.join(logsDir, getLogFileName(date));
    if (!fs.existsSync(logFile)) {
        console.log(`${colors.yellow}No log file found for date: ${date}${colors.reset}`);
        console.log(`${colors.dim}Run with --all to see available log files${colors.reset}`);
        return;
    }
    const content = fs.readFileSync(logFile, "utf8");
    const lines = content.split("\n").filter(line => line.trim());
    const filtered = filterLogs(lines, options);
    if (filtered.length === 0) {
        console.log(`${colors.yellow}No logs found matching the filters.${colors.reset}`);
        return;
    }
    // Print header
    console.log(`\n${colors.bright}=== Logs from ${date} ===${colors.reset}`);
    if (options.type) {
        console.log(`${colors.dim}Filter: Type = ${options.type}${colors.reset}`);
    }
    if (options.search) {
        console.log(`${colors.dim}Filter: Search = "${options.search}"${colors.reset}`);
    }
    console.log(`${colors.dim}Total: ${filtered.length} log entries${colors.reset}\n`);
    // Print logs
    filtered.forEach(line => {
        console.log(colorizeLogLine(line));
    });
    console.log(); // Empty line at the end
}
// Main execution
const options = parseArgs();
if (options.all) {
    listAllLogFiles();
}
else {
    viewLogs(options);
}
