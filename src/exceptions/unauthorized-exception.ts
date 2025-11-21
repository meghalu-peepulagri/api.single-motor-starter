import BaseException from "./base-exception.js";
import { UNAUTHORIZED as UNAUTHORIZED_CODE } from "../constants/http-status-codes.js";
import { UNAUTHORIZED } from "../constants/http-status-phrases.js";


class UnauthorizedException extends BaseException {
  constructor(message: string) {
    super(UNAUTHORIZED_CODE, message || UNAUTHORIZED, UNAUTHORIZED, true);
  }
}

export default UnauthorizedException;
