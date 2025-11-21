import envData from "../env.js";

const dbConfig = {
    connectionString: envData.DATABASE_URL,
};

console.log("dbConfig",dbConfig);

export default dbConfig;
