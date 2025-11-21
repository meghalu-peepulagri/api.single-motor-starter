import { defineConfig } from "drizzle-kit";
import dbConfig from "./src/config/db-config.js";
export default defineConfig({
    schema: "./src/schemas/*",
    dialect: "postgresql",
    out: "./drizzle",
    dbCredentials: {
        url: dbConfig.connectionString,
    },
});
