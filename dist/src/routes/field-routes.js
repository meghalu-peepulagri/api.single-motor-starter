import factory from "../factory.js";
import { FieldHandlers } from "../handlers/field-handlers.js";
import { isOptionalAuthorized } from "../middlewares/isAuthorized.js";
const fieldHandlers = new FieldHandlers();
const fieldRoutes = factory.createApp();
fieldRoutes.post("/", isOptionalAuthorized, fieldHandlers.addFieldHandlers);
export default fieldRoutes;
