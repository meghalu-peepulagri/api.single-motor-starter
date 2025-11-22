import UnprocessableEntityException from "../exceptions/unprocessable-entity-exception.js";

import { safeParseAsync, type BaseSchema } from "valibot";
import { getValidationErrors } from "../utils/on-error.js";
import { vAddUserValidator } from "./schema/user-validations.js";
import type { AppActivity, ValidatedRequest } from "../types/app-types.js";

const schemaMap: Record<AppActivity, BaseSchema<any, any, any>> = {
  signup: vAddUserValidator,
};

export async function validatedRequest<R extends ValidatedRequest>(
  actionType: AppActivity,
  reqData: any,
  errorMessage: string,
) {
  const schema = schemaMap[actionType];

  if (!schema) {
    throw new Error(`Schema not registered for activity: ${actionType}`);
  }

  const validation = await safeParseAsync(schema, reqData, {
    abortPipeEarly: true,
  });

  if (!validation.success) {
    throw new UnprocessableEntityException(
      errorMessage,
      getValidationErrors(validation.issues),
    );
  }

  return validation.output as R;
}
