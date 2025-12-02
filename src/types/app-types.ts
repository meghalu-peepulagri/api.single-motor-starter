import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ValidatedAddLocation } from "../validations/schema/location-validations.js";
import type { ValidatedSignInEmail, ValidatedSignInPhone, ValidatedSignUpUser, ValidatedVerifyOtp } from "../validations/schema/user-validations.js";
import type { validatedAddField } from "../validations/schema/field-validations.js";

export type ValidatedRequest = ValidatedSignUpUser | ValidatedSignInEmail | ValidatedAddLocation | ValidatedSignInPhone | ValidatedVerifyOtp | validatedAddField;

export type AppActivity = "signup" | "signin-email" | "add-location" | "signin-phone" | "verify-otp" | "add-field";


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


export interface fieldInputType {
  field_name: string;
  location_id: number;
  acres?: number | undefined;
  motors?: {
    id?: number;
    name: string;
    hp: number;
  }[] | undefined;
};

export interface arrayOfMotorInputType {
  name: string;
  hp: number;
}[];
