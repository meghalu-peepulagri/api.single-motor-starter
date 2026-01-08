import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import dbConfig from "../config/db-config.js";
import * as DeviceRunTimeSchema from "./schemas/device-runtime.js";
import * as deviceTokensSchema from "./schemas/device-tokens.js";
import * as fieldsSchema from "./schemas/fields.js";
import * as locationsSchema from "./schemas/locations.js";
import * as MotorRunTimeSchema from "./schemas/motor-runtime.js";
import * as motorSchedulesSchema from "./schemas/motor-schedules.js";
import * as motorsSchema from "./schemas/motors.js";
import * as otpSchema from "./schemas/otp.js";
import * as starterBoxSchema from "./schemas/starter-boxes.js";
import * as starterBoxParameters from "./schemas/starter-parameters.js";
import * as userActivityLogsSchema from "./schemas/user-activity-logs.js";
import * as usersSchema from "./schemas/users.js";
import * as starterDefaultSettingsSchema from "./schemas/starter-default-settings.js";
import * as starterSettingsSchema from "./schemas/starter-settings.js";
import * as starterSettingsLimitsSchema from "./schemas/starter-settings-limits.js";
import env from "../env.js";
import fs from "fs";


const { Pool } = pg;

const dbClient = new Pool({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(`${process.cwd()}/ca.pem`).toString(),
  },
  // connectionString: dbConfig.connectionString,
});

const db = drizzle(dbClient, {
  schema: {
    ...usersSchema,
    ...locationsSchema,
    ...motorsSchema,
    ...fieldsSchema,
    ...otpSchema,
    ...deviceTokensSchema,
    ...userActivityLogsSchema,
    ...starterBoxSchema,
    ...starterBoxParameters,
    ...motorSchedulesSchema,
    ...DeviceRunTimeSchema,
    ...MotorRunTimeSchema,
    ...starterDefaultSettingsSchema,
    ...starterSettingsSchema,
    ...starterSettingsLimitsSchema
  },
});

export default db;
