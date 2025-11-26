import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ValidatedAddLocation } from "../validations/schema/location-validations.js";
import type { ValidatedSignInEmail, ValidatedSignUpUser } from "../validations/schema/user-validations.js";

export type ValidatedRequest = ValidatedSignUpUser | ValidatedSignInEmail | ValidatedAddLocation;

export type AppActivity = "signup" | "signin-email" | "add-location";


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