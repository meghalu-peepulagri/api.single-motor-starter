# iDhara Smart Motor Starter - Complete Project Explanation

## 🎯 What This Project Is

**iDhara** is a complete IoT platform for remotely controlling agricultural water pumps (motors). Think of it as a "smart switch" that farmers can control from their phones to turn pumps ON/OFF, schedule watering times, and monitor power usage.

---

## 📦 What We Have (Components)

### 1. **Hardware (Physical Devices)**
- **Starter Box**: A physical electronic device installed at the motor location
  - Has a PCB (Printed Circuit Board) with unique number
  - Has Serial Number (Starter Number)
  - Has MAC Address (network identifier)
  - Contains relays to control motor power
  - Has sensors to measure Voltage, Current, Temperature
  - Connects to internet via 4G/WiFi

### 2. **Backend API (This Project)**
- Built with **Hono** framework (like Express but faster)
- **TypeScript** for type safety
- **PostgreSQL** database to store all data
- **Drizzle ORM** to interact with database
- **MQTT Service** for real-time device communication

### 3. **Mobile/Web Apps** (Not in this repo, but this API serves them)
- Mobile App for farmers (Users)
- Web Dashboard for admins/manufacturers

---

## 🗄️ What's Stored in Database

### Core Tables:

#### **1. Users Table**
```
- id, name, email, phone, password
- user_type: "ADMIN" or "USER"
- user_verified: true/false
```

#### **2. Starter Boxes Table** (The Devices)
```
- id, name, starter_number, pcb_number, mac_address
- device_status: "READY" → "DEPLOYED" → "ASSIGNED"
- user_id: who owns it (null if not assigned)
- location_id: where it's installed
- power: current power state (0=OFF, 1=ON)
- created_by: which admin added it
```

#### **3. Motors Table** (Virtual representation)
```
- id, name, alias_name, hp (horsepower)
- starter_id: which physical device controls it
- location_id: farm/field location
- state: "ON" or "OFF"
- mode: "MANUAL" or "AUTO"
```

#### **4. Locations Table**
```
- id, name (e.g., "North Field", "Well #2")
- user_id: owner
```

#### **5. Motor Schedules Table**
```
- id, motor_id, start_time, end_time
- days: ["MON", "WED", "FRI"]
- is_active: true/false
```

#### **6. Settings Tables**
```
- starter_default_settings: Factory defaults
- starter_settings: User customizations
- starter_settings_limits: Min/Max boundaries
```

#### **7. Runtime & Analytics Tables**
```
- device_runtime: Logs when device was ON/OFF
- motor_runtime: Logs motor operation times
- alerts_faults: Error logs (overcurrent, etc.)
```

---

## 🔄 What Happens (Key Workflows)

### **FLOW 1: Manufacturing (Admin Adds Device)**

```
1. Admin logs into Dashboard
2. Clicks "Add New Device"
3. Enters:
   - Starter Number: "SMS001234"
   - PCB Number: "PCB-2024-001"
   - MAC Address: "AA:BB:CC:DD:EE:FF"
   - Device Name: "Starter Box #1234"

4. System validates:
   ✓ Serial number is unique
   ✓ PCB number is unique
   ✓ MAC address is unique

5. Saves to database:
   - status: "ACTIVE"
   - device_status: "READY" (can be changed to "DEPLOYED" when ready to sell)
   - created_by: admin's user_id

6. Device is now in inventory
```

**Code Location**: `src/handlers/starter-handlers.ts` → `addStarterBoxHandler()`

---

### **FLOW 2: User Buys & Assigns Device (Onboarding)**

```
1. User buys physical device from shop
2. Opens Mobile App
3. Taps "Add New Motor"
4. Enters:
   - Starter Number: "SMS001234" (printed on device)
   - PCB Number: "PCB-2024-001" (printed on device)
   - Motor Name: "My Farm Pump"
   - Location: "North Field"

5. System performs CRITICAL VALIDATIONS:

   ❓ CHECK 1: Does device exist?
   → Query: SELECT * FROM starter_boxes WHERE starter_number = 'SMS001234'
   → If NOT FOUND: ❌ "Invalid Starter Number"

   ❓ CHECK 2: Is it deployed?
   → Check: device_status == "DEPLOYED"?
   → If NO: ❌ "Device Not Ready (Contact Support)"

   ❓ CHECK 3: Is it already assigned?
   → Check: user_id IS NULL?
   → If ASSIGNED: ❌ "Already assigned to someone else"

   ❓ CHECK 4: Does PCB match? (SECURITY CHECK)
   → Check: pcb_number == "PCB-2024-001"?
   → If MISMATCH: ❌ "PCB Number Mismatch"

6. If ALL PASS:
   - Update starter_boxes:
     - user_id = current_user.id
     - device_status = "ASSIGNED"
     - location_id = selected_location
     - assigned_at = NOW()
   
   - Create motor record:
     - name = "My Farm Pump"
     - starter_id = starter_box.id
     - location_id = selected_location
     - created_by = user.id

   - Log activity:
     - action = "DEVICE_ASSIGNED"

7. ✅ Success! User can now control the motor
```

**Code Location**: `src/handlers/starter-handlers.ts` → `assignStarterMobileHandler()`

---

### **FLOW 3: User Turns Motor ON/OFF**

```
1. User opens app, sees their motors
2. Taps ON button for "My Farm Pump"

3. App sends API request:
   POST /motors/:id/control
   Body: { "command": "ON" }

4. Backend (Motor Handler):
   - Validates user owns this motor
   - Gets starter_id from motor record
   - Publishes MQTT message:
     Topic: "device/123/command"
     Payload: {
       "T": 11,  // Type: Motor Control
       "S": 1,   // Sequence number
       "M": 1,   // Motor number
       "C": 1    // Command: 1=ON, 0=OFF
     }

5. MQTT Broker forwards to physical device

6. Hardware (Starter Box):
   - Receives MQTT message
   - Activates relay → Motor starts
   - Sends ACK back:
     Topic: "device/123/ack"
     Payload: { "T": 44, "S": 1, "D": 1 }

7. Backend (MQTT Service):
   - Receives ACK
   - Updates database:
     - motors.state = "ON"
     - motors.mode = "MANUAL"
     - device_runtime: logs start time

8. App shows motor as ON (via WebSocket or polling)
```

**Code Locations**:
- `src/handlers/motor-handlers.ts`
- `src/services/mqtt-service.ts`

---

### **FLOW 4: Scheduled Automation**

```
1. User creates schedule:
   - Motor: "My Farm Pump"
   - Days: Monday, Wednesday, Friday
   - Start: 06:00 AM
   - Duration: 2 hours

2. Saved to motor_schedules table

3. Backend has CRON job running every minute:
   - Checks: "Is it time to run any schedule?"
   - If YES:
     - Sends MQTT ON command
     - Updates motor.mode = "AUTO"
   
4. After 2 hours:
   - Sends MQTT OFF command
   - Logs runtime to database
```

**Code Location**: `src/handlers/motor-scheduling-handlers.ts`

---

### **FLOW 5: Settings Management**

```
1. User wants to change voltage limits:
   - Min Voltage: 200V
   - Max Voltage: 250V

2. App sends:
   POST /settings/:starter_id
   Body: { "min_voltage": 200, "max_voltage": 250 }

3. Backend:
   - Validates values are within allowed limits
   - Saves to starter_settings table
   - Publishes to MQTT:
     Topic: "device/123/settings"
     Payload: { settings object }

4. Waits for ACK (with retry logic):
   - Try 1: Wait 5 seconds
   - If no ACK → Try 2: Resend
   - If no ACK → Try 3: Resend
   - After 3 tries: Log failure

5. Device receives settings:
   - Updates internal configuration
   - Sends ACK
   - Now operates with new limits
```

**Code Location**: `src/handlers/starter-default-settings-handlers.ts`

---

## 🔐 Security & Validations

### **1. Authentication**
- **Email Login** (Admin): Email + Password → JWT Token
- **Phone Login** (User): Phone + OTP → JWT Token
- All API requests require valid JWT in header

### **2. Authorization**
- Middleware checks: `isAuthorized`
- Users can only see/control their own devices
- Admins can see all devices

### **3. Device Assignment Security**
- **PCB Number Matching**: Prevents someone from claiming a device by just guessing the serial number
- **Deployment Check**: Prevents assigning devices still in testing
- **Uniqueness**: One device = One user at a time

---

## 📊 Analytics & Monitoring

### **What's Tracked:**
1. **Runtime**: How long motor ran each day
2. **Power Usage**: Voltage, Current, Power consumption
3. **Alerts**: 
   - Overcurrent
   - Overvoltage/Undervoltage
   - Overtemperature
   - Communication loss
4. **User Activity**: Who did what and when

### **How It Works:**
- Device sends telemetry every 30 seconds via MQTT
- Backend stores in `device_runtime` table
- API endpoints aggregate data for charts:
  - Daily usage graphs
  - Monthly power consumption
  - Fault history

**Code Location**: `src/handlers/starter-handlers.ts` → `starterAnalyticsHandler()`

---

## 🏗️ Architecture Summary

```
┌─────────────┐
│ Mobile App  │ ←→ REST API (This Project)
└─────────────┘

┌─────────────┐
│ Web Dashboard│ ←→ REST API (This Project)
└─────────────┘

                    ↓
            ┌───────────────┐
            │  Hono Server  │
            │  (Routes)     │
            └───────┬───────┘
                    ↓
            ┌───────────────┐
            │   Handlers    │ ← Business Logic
            └───────┬───────┘
                    ↓
            ┌───────────────┐
            │   Services    │ ← DB Operations
            └───────┬───────┘
                    ↓
            ┌───────────────┐
            │  PostgreSQL   │ ← Data Storage
            └───────────────┘

            ┌───────────────┐
            │ MQTT Service  │ ←→ MQTT Broker ←→ Hardware Devices
            └───────────────┘
```

---

## 📁 Code Structure

```
src/
├── routes/           # API endpoints (URL definitions)
│   ├── auth-routes.ts
│   ├── motor-routes.ts
│   ├── starter-routes.ts
│   └── ...
│
├── handlers/         # Controllers (business logic)
│   ├── auth-handlers.ts
│   ├── motor-handlers.ts
│   ├── starter-handlers.ts
│   └── ...
│
├── services/         # Data access layer
│   ├── db/
│   │   ├── base-db-services.ts    # Generic CRUD
│   │   ├── motor-services.ts
│   │   └── starter-services.ts
│   └── mqtt-service.ts            # Device communication
│
├── database/
│   ├── configuration.ts           # DB connection
│   └── schemas/                   # Table definitions
│       ├── users.ts
│       ├── motors.ts
│       ├── starter-boxes.ts
│       └── ...
│
├── validations/      # Input validation schemas
├── middlewares/      # Auth, error handling
├── helpers/          # Utility functions
└── constants/        # App constants
```

---

## 🚀 Key Technologies

- **Hono**: Web framework (like Express but faster)
- **Drizzle ORM**: Type-safe database queries
- **PostgreSQL**: Relational database
- **MQTT**: IoT messaging protocol
- **Argon2**: Password hashing
- **JWT**: Authentication tokens
- **Moment.js**: Date/time handling

---

## 🎯 Summary

This is a **complete IoT platform** that:
1. ✅ Manages device inventory (Admin)
2. ✅ Handles user onboarding with security checks
3. ✅ Provides real-time motor control via MQTT
4. ✅ Supports scheduling and automation
5. ✅ Tracks analytics and alerts
6. ✅ Manages user permissions and authentication
7. ✅ Handles settings synchronization with hardware

It's production-ready with proper error handling, transactions, logging, and security measures!
