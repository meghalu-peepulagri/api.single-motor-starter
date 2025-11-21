import BaseException from "./base-exception.js";
import { NOT_FOUND as NOT_FOUND_CODE } from "../constants/http-status-codes.js";
import { NOT_FOUND } from "../constants/http-status-phrases.js";
 

export default class NotFoundException extends BaseException {
  constructor(message?: string, errData?: any) {
    super(NOT_FOUND_CODE, message || NOT_FOUND, NOT_FOUND, true, errData);
  }
}
