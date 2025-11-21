import "dotenv/config";
import { object, string, pipe, transform, parse, flatten } from "valibot";
const VEnvSchema = object({
    API_VERSION: string(),
    DATABASE_URL: string(),
    PORT: pipe(string(), transform((val) => {
        const num = Number(val);
        if (isNaN(num)) {
            throw new Error(`PORT must be a valid number, received '${val}'`);
        }
        return num;
    })),
    JWT_SECRET: string(),
});
let envData;
try {
    envData = parse(VEnvSchema, process.env);
}
catch (err) {
    const error = err;
    console.error("\n Invalid or Missing Environment Variables:\n");
    console.error(flatten(error.issues));
    process.exit(1);
}
export default envData;
