// env.ts
import "dotenv/config";
import { flatten, object, parse, pipe, string, transform } from "valibot";
// Env validation schema
const VEnvSchema = object({
    API_VERSION: string(),
    DATABASE_URL: string(),
    // DB_NAME: string(),
    // DB_HOST: string(),
    //   DB_PORT: pipe(string(), transform(val => {
    //     const num = Number(val);
    //     if (isNaN(num)) throw new Error(`DB_PORT must be a number, got '${val}'`);
    //     return num;
    //   })),
    // DB_USER: string(),
    // DB_PASSWORD: string(),
    //   EMQX_API_KEY: string(),
    //   EMQX_USERNAME: string(),
    //   EMQX_PASSWORD: string(),
    //   EMQX_CLIENT_ID: string(),
    PORT: pipe(string(), transform(val => {
        const num = Number(val);
        if (isNaN(num))
            throw new Error(`DB_PORT must be a number, got '${val}'`);
        return num;
    })),
});
let envData;
try {
    envData = parse(VEnvSchema, process.env, { abortPipeEarly: true });
}
catch (e) {
    const error = e;
    console.error("❌ Invalid Environment Variables:");
    console.error(flatten(error.issues));
    process.exit(1);
}
export default envData;
