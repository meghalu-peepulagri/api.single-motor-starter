import envData from "../env.js";

export const dbConfig = {
  connectionString: envData.DATABASE_URL,
  // host: envData.DB_HOST!,
  // port: Number(envData.DB_PORT)!,
  // user: envData.DB_USER!,
  // password: envData.DB_PASSWORD!,
  // name: envData.DB_NAME!,
};

export default dbConfig;