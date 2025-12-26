// import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";
// import type { ValidatedRequest } from "../types/app-types.js";
// import { getValidationErrors } from "../utils/on-error.js";
// import type { BaseSchema, InferOutput } from "valibot";
// import { safeParseAsync } from "valibot";
// export {};
// const schemaMap: Record<AppActivity, BaseSchema | undefined> = {
// };
// export async function validatedRequest<R extends ValidatedRequest>(
//   actionType: AppActivity,
//   reqData: any,
//   errorMessage: string,
// ) {
//   const schema = schemaMap[actionType];
//   if (!schema) {
//     throw new Error(`Schema not registered for activity: ${actionType}`);
//   }
//   const validation = await safeParseAsync(schema, reqData);
//   if (!validation.success) {
//     throw new UnprocessableEntityException(
//       errorMessage,
//       getValidationErrors(validation.issues),
//     );
//   }
//   return validation.output as R;
// // }
