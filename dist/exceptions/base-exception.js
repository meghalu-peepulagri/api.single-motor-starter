export default class BaseException extends Error {
    status;
    isOperational;
    errData;
    constructor(status, message, name, isOperational, errData) {
        super(message);
        this.status = status;
        this.name = name;
        this.isOperational = isOperational;
        this.errData = errData;
    }
}
