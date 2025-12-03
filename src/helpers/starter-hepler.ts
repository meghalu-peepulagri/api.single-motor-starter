import type { User } from "../database/schemas/users.js";
import type { starterBoxPayloadType } from "../types/app-types.js";


export function prepareStarterData(starterBoxPayload: starterBoxPayloadType, userPayload: User) {
  return { ...starterBoxPayload, created_by: userPayload.id };

}