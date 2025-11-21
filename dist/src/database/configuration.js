import { Pool } from "pg";
import fs from "fs";
import { drizzle } from "drizzle-orm/node-postgres";
import env from "../env.js";
const dbClient = new Pool({
    //   host: env.DB_HOST,
    //   port: Number(env.DB_PORT),
    //   user: env.DB_USER,
    //   password: env.DB_PASSWORD,
    //   database: env.DB_NAME,
    database: env.DATABASE_URL,
    ssl: {
        ca: fs.readFileSync(`${process.cwd()}/ca.pem`).toString()
    }
});
console.log("dbClient", dbClient);
export const db = drizzle(dbClient);
