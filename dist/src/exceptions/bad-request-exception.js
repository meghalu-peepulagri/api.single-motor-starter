import BaseException from "./base-exception.js";
import { BAD_REQUEST } from "../constants/http-status-phrases.js";
import { BAD_REQUEST as BAD_REQUEST_CODE } from "../constants/http-status-codes.js";
class BadRequestException extends BaseException {
    constructor(message) {
        super(BAD_REQUEST_CODE, message ?? BAD_REQUEST, BAD_REQUEST, true);
    }
}
export default BadRequestException;
