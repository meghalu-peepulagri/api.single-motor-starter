import factory from "../factory.js";
import { FieldHandlers } from "../handlers/field-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";

const fieldHandlers = new FieldHandlers();
const fieldRoutes = factory.createApp();

fieldRoutes.post("/", isAuthorized, fieldHandlers.addField);
fieldRoutes.get("/", isAuthorized, fieldHandlers.listFields);
fieldRoutes.patch("/:id", isAuthorized, fieldHandlers.updateField);

export default fieldRoutes;
