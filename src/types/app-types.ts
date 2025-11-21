import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ValidatedAddUser } from "../validations/schema/user-validations.js";

export type ValidatedRequest = ValidatedAddUser

export type AppActivity = "signup"


export interface IResp {
  status: ContentfulStatusCode;
  success: boolean;
  message: string;
}

export interface IRespWithData<T = unknown> extends IResp {
  data: T;
}

export interface JWTPayload {
  sub: number;
  iat: number;
}