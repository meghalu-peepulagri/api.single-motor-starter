import { FORBIDDEN } from "../constants/http-status-phrases.js";
import BaseException from "./base-exception.js";
import { FORBIDDEN as FORBIDDEN_CODE } from "../constants/http-status-codes.js";
class ForbiddenException extends BaseException {
    constructor(message) {
        super(FORBIDDEN_CODE, message || FORBIDDEN, FORBIDDEN, true);
    }
}
export default ForbiddenException;
