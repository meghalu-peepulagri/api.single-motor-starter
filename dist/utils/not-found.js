import { NOT_FOUND } from "../constants/http-status-codes.js";
import { NOT_FOUND as NOT_FOUND_MESSAGE } from "../constants/http-status-phrases.js";
const notFound = (c) => {
    return c.json({
        status: NOT_FOUND,
        message: `${NOT_FOUND_MESSAGE} - ${c.req.path}`,
    }, NOT_FOUND);
};
export default notFound;
