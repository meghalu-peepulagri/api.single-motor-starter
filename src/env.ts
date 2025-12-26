import "dotenv/config";
import type { InferOutput, ValiError } from "valibot";
import { flatten, object, parse, string } from "valibot";

const VEnvSchema = object({
  API_VERSION: string(),
  DATABASE_URL: string(),
  PORT: string(),
  // DB_HOST: string(),
  // DB_USER: string(),
  // DB_PASSWORD: string(),
  // DB_NAME: string(),
  // DB_PORT: string(),
  JWT_SECRET: string(),
  EMQX_API_KEY: string(),
  EMQX_USERNAME: string(),
  EMQX_PASSWORD: string(),
  EMQX_CLIENT_ID: string(),
  MSG91_SMS_API_KEY: string(),
  MSG91_SMS_TEMPLATE_ID: string(),
});


export type Env = InferOutput<typeof VEnvSchema>;

let envData: Env;

try {
  envData = parse(VEnvSchema, process.env);
} catch (err) {
  const error = err as ValiError<typeof VEnvSchema>;
  console.error("\n Invalid or Missing Environment Variables:\n");
  console.error(flatten(error.issues));
  process.exit(1);
}

export default envData;
