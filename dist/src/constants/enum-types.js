import { pgEnum } from "drizzle-orm/pg-core";
export const statusEnum = pgEnum("status_enum", ["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const userTypeEnum = pgEnum("user_type", ["ADMIN", "USER"]);
export const modeEnum = pgEnum("mode_enum", ["LOCAL+MANUAL", "REMOTE+MANUAL", "LOCAL+AUTO", "REMOTE+AUTO"]);
