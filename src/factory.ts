import { createFactory } from "hono/factory";
import type { Variables } from "hono/types";
import type { User } from "./database/schemas/users.js";

type UserPayload = Omit<User, "password">;

interface AppBindings {
  Variables: Variables & {
    user_payload: UserPayload;
    sub_user_payload: UserPayload | undefined;
  };
}

const factory = createFactory<AppBindings>();

export default factory;
