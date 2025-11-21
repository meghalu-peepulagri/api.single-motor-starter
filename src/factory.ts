
import { createFactory } from "hono/factory";
import type { Variables } from "hono/types";

interface AppBindings {
  Variables: Variables;
}

const factory = createFactory<AppBindings>();

export default factory;
