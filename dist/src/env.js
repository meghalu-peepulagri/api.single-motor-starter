import "dotenv/config";
import { flatten, object, parse, string } from "valibot";
import { logger } from "./utils/logger.js";
const VEnvSchema = object({
    API_VERSION: string(),
    // DATABASE_URL: string(),
    PORT: string(),
    DB_HOST: string(),
    DB_USER: string(),
    DB_PASSWORD: string(),
    DB_NAME: string(),
    DB_PORT: string(),
    JWT_SECRET: string(),
    EMQX_API_KEY: string(),
    EMQX_USERNAME: string(),
    EMQX_PASSWORD: string(),
    EMQX_CLIENT_ID: string(),
    MSG91_SMS_API_KEY: string(),
    MSG91_SMS_TEMPLATE_ID: string(),
    // REDIS_HOST: string(),
    // REDIS_PORT: string(),
    FCM_TYPE: string(),
    FCM_PROJECT_ID: string(),
    FCM_PRIVATE_KEY_ID: string(),
    FCM_CLIENT_EMAIL: string(),
    FCM_CLIENT_ID: string(),
    FCM_AUTH_URI: string(),
    FCM_TOKEN_URI: string(),
    FCM_AUTH_PROVIDER_X509_CERT_URL: string(),
    FCM_CLIENT_X509_CERT_URL: string(),
    FCM_UNIVERSE_DOMAIN: string(),
    FCM_PRIMERY_KEY: string(),
});
let envData;
try {
    envData = parse(VEnvSchema, process.env);
}
catch (err) {
    const error = err;
    logger.error("Invalid or Missing Environment Variables", error, flatten(error.issues));
    process.exit(1);
}
export default envData;
