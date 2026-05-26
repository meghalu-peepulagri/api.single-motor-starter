import factory from "../factory.js";
import { FieldHandlers } from "../handlers/field-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
const fieldHandlers = new FieldHandlers();
const fieldRoutes = factory.createApp();
fieldRoutes.post("/", isAuthorized, fieldHandlers.addFieldHandler);
fieldRoutes.get("/", isAuthorized, fieldHandlers.listFieldsHandler);
fieldRoutes.patch("/:id", isAuthorized, fieldHandlers.updateFieldHandler);
export default fieldRoutes;
