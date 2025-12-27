import { defineConfig } from "drizzle-kit";
import fs from "fs";
// aiven
// export default defineConfig({
//   dialect: "postgresql",
//   schema: "./dist/src/database/schemas/*",
//   out: "./migrations",
//   dbCredentials: {
//     host: process.env.DB_HOST!,
//     port: Number(process.env.DB_PORT!),
//     user: process.env.DB_USER!,
//     password: process.env.DB_PASSWORD!,
//     database: process.env.DB_NAME!,
//     ssl: {
//       rejectUnauthorized: true,
//       ca: fs.readFileSync(`${process.cwd()}/ca.pem`).toString(),
//     },
//   },
// });
// railway
export default defineConfig({
    schema: "./dist/src/database/schemas/*",
    dialect: "postgresql",
    out: "./drizzle",
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
});
