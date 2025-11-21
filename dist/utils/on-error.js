// import type { Context, ErrorHandler } from "hono";
// import type { ContentfulStatusCode, StatusCode } from "hono/utils/http-status";
export {};
// import { INTERNAL_SERVER_ERROR, OK } from "../constants/http-status-codes.js";
// export function getValidationErrors(issues: $ZodIssue[] | undefined = []) {
//   const errors: Record<string, string> = {};
//   for (const issue of issues) {
//     const path = issue.path ?? [];
//     if (path.length > 0) {
//       const field = String(path[path.length - 1]);
//       errors[field] = issue.message;
//     }
//   }
//   return errors;
// }
// const onError: ErrorHandler = (err: any, c: Context) => {
//   const currentStatus = "status" in err
//     ? err.status
//     : c.newResponse(null).status;
//   const statusCode = currentStatus !== OK
//     ? (currentStatus as StatusCode)
//     : INTERNAL_SERVER_ERROR;
//   return c.json(
//     {
//       success: false,
//       status: statusCode,
//       message: err.message || "Internal server error",
//       errors: err.errData,
//     },
//     statusCode as ContentfulStatusCode,
//   );
// };
// export default onError;
