import { INTERNAL_SERVER_ERROR } from "../constants/http-status-phrases.js";
import { INTERNAL_SERVER_ERROR as INTERNAL_SERVER_ERROR_MESSAGE } from "../constants/http-status-codes.js";
import BaseException from "./base-exception.js";
export default class InternalServerErrorException extends BaseException {
    constructor(message, errData) {
        super(INTERNAL_SERVER_ERROR_MESSAGE, message || INTERNAL_SERVER_ERROR, INTERNAL_SERVER_ERROR, true, errData);
    }
}
