import { drizzle } from "drizzle-orm/node-postgres";
import fs from "node:fs";
import pg from "pg";

import env from "../env.js";
import * as usersSchema from "./schemas/users.js";

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
});
const db = drizzle(dbClient, {
  schema: {
    ...usersSchema,
  },
});

export default db;
