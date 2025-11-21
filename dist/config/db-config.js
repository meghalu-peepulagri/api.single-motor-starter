import envData from "../env.js";

console.log("DATABASE_URL in env data",envData);

const dbConfig = {
    connectionString: envData.DATABASE_URL,
};

console.log("dbConfig", dbConfig);

export default dbConfig;