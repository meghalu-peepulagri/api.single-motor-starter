import { CONFLICT } from "../constants/http-status-phrases.js";
import BaseException from "./base-exception.js";
import { CONFLICT as CONFLICT_CODE } from "../constants/http-status-codes.js";

class ConflictException extends BaseException {
  constructor(message?: string, errData?: any) {
    super(CONFLICT_CODE, message || CONFLICT, CONFLICT, true, errData);
  }
}

export default ConflictException;
