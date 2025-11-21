import { UNPROCESSABLE_ENTITY } from "../constants/http-status-phrases.js";
import BaseException from "./base-exception.js";
import { UNPROCESSABLE_ENTITY as  UNPROCESSABLE_ENTITY_CODE} from "../constants/http-status-codes.js";


export default class UnprocessableEntityException extends BaseException {
  constructor(message?: string, errData?: any) {
    super(UNPROCESSABLE_ENTITY_CODE, message || UNPROCESSABLE_ENTITY, UNPROCESSABLE_ENTITY, true, errData);
  }
}
