# Log Viewer - Quick Reference

## 📋 View All Logs (One Command)

```bash
# View today's logs
npm run logs

# View all available log files
npm run logs -- --all
```

## 🔍 Filter and Search

```bash
# Filter by log type
npm run logs -- --type MQTT
npm run logs -- --type ERROR
npm run logs -- --type DATABASE

# Search for keywords
npm run logs -- --search "connection"
npm run logs -- --search "error"
npm run logs -- --search "PCB123"

# View specific date
npm run logs -- --date 2026-01-12

# Show last N lines
npm run logs -- --tail 50
npm run logs -- --tail 100

# Combine filters
npm run logs -- --type ERROR --search "database"
npm run logs -- --date 2026-01-11 --type MQTT
npm run logs -- --type ERROR --tail 20
```

## 📁 Log File Location

Logs are saved in: `logs/idhara-YYYY-MM-DD.log`

Example:
- `logs/idhara-2026-01-12.log`
- `logs/idhara-2026-01-11.log`

## 🎯 Common Use Cases

```bash
# See all errors from today
npm run logs -- --type ERROR

# See all MQTT activity
npm run logs -- --type MQTT

# Find logs mentioning a specific device
npm run logs -- --search "PCB12345"

# See last 30 log entries
npm run logs -- --tail 30

# Debug database issues
npm run logs -- --type DATABASE --search "error"

# Check yesterday's logs
npm run logs -- --date 2026-01-11
```

## 🖥️ Server Usage

On your production server, use the same commands:

```bash
ssh user@your-server.com
cd /path/to/app
npm run logs -- --type ERROR --tail 50
```

## ⚙️ Configuration

File logging is **enabled by default**. To disable:

```env
# In .env file
ENABLE_FILE_LOGGING=false
```

## 📊 Log Format

**Console Output** (colored):
```
2026-01-12T08:30:15.123Z [MQTT] Subscribed to topic: peepul/+/status
```

**File Output** (plain text):
```
2026-01-12T08:30:15.123Z [MQTT] Subscribed to topic: peepul/+/status | Context: {"topic":"peepul/+/status"}
```
