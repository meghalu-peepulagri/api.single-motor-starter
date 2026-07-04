# Sub-user Management — Implementation Plan

**Stack:** Hono v4 · Drizzle ORM · PostgreSQL · Valibot

---

## Approach

- Sub-users are stored in the **existing `users` table** with `user_type = "SUB_USER"` and a `parent_id` column
- **One single table** `sub_user_permissions` stores the list of allowed permission keys as a **JSONB string array** per sub-user
- No separate roles table, no multi-table joins — permissions are assigned directly

---

## Step 1 — Schema Changes

### A. Add `SUB_USER` to enum

File: `src/constants/enum-types.ts`

```ts
export const userTypeEnum = pgEnum("user_type", [
  "SUPER_ADMIN", "ADMIN", "USER", "DISPATCH", "SUB_USER",
]);
```

---

### B. Add `parent_id` column to `users` table

File: `src/database/schemas/users.ts`

```ts
parent_id: integer("parent_id")
  .references((): AnyPgColumn => users.id)
  .default(sql`NULL`),
```

`NULL` for all existing users — no behavior change.

---

### C. New table — `sub_user_permissions`

File: `src/database/schemas/sub-user-permissions.ts`

```ts
import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const subUserPermissions = pgTable("sub_user_permissions", {
  id:          serial("id").primaryKey(),
  user_id:     integer("user_id").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  parent_id:   integer("parent_id").notNull().references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
  permissions: jsonb("permissions").$type<string[]>().default(sql`'[]'::jsonb`),
  created_at:  timestamp("created_at").notNull().defaultNow(),
  updated_at:  timestamp("updated_at").defaultNow(),
}, table => [
  uniqueIndex("uniq_sub_user_perm").on(table.user_id, table.parent_id),
]);

export type SubUserPermissions    = typeof subUserPermissions.$inferSelect;
export type NewSubUserPermissions = typeof subUserPermissions.$inferInsert;
export type SubUserPermissionsTable = typeof subUserPermissions;
```

**Available permission keys:**

| Key | What it allows |
|---|---|
| `MOTOR_CONTROL` | Turn motor ON / OFF |
| `MODE_CONTROL` | Change motor mode |
| `REPORTS_VIEW` | View analytics & reports |
| `LOGS_VIEW` | View activity logs |
| `USER_VIEW` | View user details |

---

## Step 2 — Run Migrations

```bash
npm run db:gen    # generate migration
npm run db:apply  # apply to database
```

---

## Step 3 — New Files

Follow existing patterns from `user-handlers.ts`, `user-services.ts`, `guardUser.ts`.

### File structure

```
src/
├── database/schemas/
│   └── sub-user-permissions.ts      ← new (step 1C)
├── validations/schema/
│   └── sub-user-validations.ts
├── services/db/
│   └── sub-user-services.ts
├── handlers/
│   └── sub-user-handlers.ts
├── middlewares/guards/
│   └── requirePermission.ts
└── routes/
    └── sub-user-routes.ts
```

---

### sub-user-validations.ts

```ts
import * as v from "valibot";

const PERMISSION_KEYS = [
  "MOTOR_CONTROL", "MODE_CONTROL", "REPORTS_VIEW", "LOGS_VIEW", "USER_VIEW",
] as const;

export const createSubUserSchema = v.object({
  full_name: v.pipe(v.string(), v.minLength(2)),
  phone:     v.pipe(v.string(), v.length(10)),
  email:     v.optional(v.pipe(v.string(), v.email())),
  password:  v.optional(v.string()),
});

export const updatePermissionsSchema = v.object({
  permissions: v.array(v.picklist(PERMISSION_KEYS)),
});

export type CreateSubUserInput    = v.InferOutput<typeof createSubUserSchema>;
export type UpdatePermissionsInput = v.InferOutput<typeof updatePermissionsSchema>;
```

---

### sub-user-services.ts

```ts
import { and, eq, ne } from "drizzle-orm";
import argon2 from "argon2";
import db from "../../database/configuration.js";
import { users } from "../../database/schemas/users.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import type { CreateSubUserInput } from "../../validations/schema/sub-user-validations.js";

export async function createSubUser(parentId: number, data: CreateSubUserInput) {
  return await db.transaction(async (trx) => {
    const hashedPassword = await argon2.hash(data.password ?? "i@123456");

    const [newUser] = await trx.insert(users).values({
      ...data,
      password:   hashedPassword,
      user_type:  "SUB_USER",
      parent_id:  parentId,
      created_by: parentId,
      user_verified: true,
    }).returning();

    await trx.insert(subUserPermissions).values({
      user_id:     newUser.id,
      parent_id:   parentId,
      permissions: [],
    });

    return newUser;
  });
}

export async function getSubUsers(parentId: number) {
  return await db
    .select({
      id: users.id, full_name: users.full_name,
      phone: users.phone, email: users.email, status: users.status,
    })
    .from(users)
    .where(and(
      eq(users.parent_id, parentId),
      eq(users.user_type, "SUB_USER"),
      ne(users.status, "ARCHIVED"),
    ));
}

export async function softDeleteSubUser(parentId: number, subUserId: number) {
  const [updated] = await db.update(users)
    .set({ status: "ARCHIVED", updated_at: new Date() })
    .where(and(eq(users.id, subUserId), eq(users.parent_id, parentId)))
    .returning({ id: users.id });
  return !!updated;
}

export async function getSubUserPermissions(userId: number, parentId: number): Promise<string[]> {
  const row = await db.query.subUserPermissions.findFirst({
    where: and(
      eq(subUserPermissions.user_id, userId),
      eq(subUserPermissions.parent_id, parentId),
    ),
  });
  return row?.permissions ?? [];
}

export async function setSubUserPermissions(userId: number, parentId: number, permissions: string[]) {
  return await db.update(subUserPermissions)
    .set({ permissions, updated_at: new Date() })
    .where(and(
      eq(subUserPermissions.user_id, userId),
      eq(subUserPermissions.parent_id, parentId),
    ));
}
```

---

### requirePermission.ts

```ts
import { createMiddleware } from "hono/factory";
import ForbiddenException from "../../exceptions/forbidden-exception.js";
import { FORBIDDEN } from "../../constants/http-status-phrases.js";
import { getSubUserPermissions } from "../../services/db/sub-user-services.js";

export const requirePermission = (permKey: string) =>
  createMiddleware(async (c, next) => {
    const user = c.get("user_payload");

    // non-sub-users pass freely — zero extra DB queries
    if (user.user_type !== "SUB_USER") return await next();

    if (!user.parent_id) throw new ForbiddenException(FORBIDDEN);

    const permissions = await getSubUserPermissions(user.id, user.parent_id);
    if (!permissions.includes(permKey)) throw new ForbiddenException(FORBIDDEN);

    await next();
  });
```

---

### sub-user-handlers.ts

```ts
import type { Context } from "hono";
import { sendResponse } from "../utils/send-response.js";
import { ParamsValidateException } from "../exceptions/params-validate-exception.js";
import {
  createSubUser, getSubUsers, softDeleteSubUser,
  getSubUserPermissions, setSubUserPermissions,
} from "../services/db/sub-user-services.js";
import { createSubUserSchema, updatePermissionsSchema } from "../validations/schema/sub-user-validations.js";
import * as v from "valibot";

const paramsValidateException = new ParamsValidateException();

export class SubUserHandlers {
  listSubUsersHandler = async (c: Context) => {
    const user = c.get("user_payload");
    const data = await getSubUsers(user.id);
    return sendResponse(c, 200, "Sub-users fetched", data);
  };

  createSubUserHandler = async (c: Context) => {
    const user = c.get("user_payload");
    const body = await c.req.json();
    paramsValidateException.emptyBodyValidation(body);
    const validated = v.parse(createSubUserSchema, body);
    const created = await createSubUser(user.id, validated);
    const { password, ...result } = created;
    return sendResponse(c, 201, "Sub-user created", result);
  };

  deleteSubUserHandler = async (c: Context) => {
    const user = c.get("user_payload");
    const subId = Number(c.req.param("id"));
    paramsValidateException.validateId(subId, "sub-user id");
    await softDeleteSubUser(user.id, subId);
    return sendResponse(c, 200, "Sub-user removed");
  };

  getPermissionsHandler = async (c: Context) => {
    const user = c.get("user_payload");
    const subId = Number(c.req.param("id"));
    paramsValidateException.validateId(subId, "sub-user id");
    const permissions = await getSubUserPermissions(subId, user.id);
    return sendResponse(c, 200, "Permissions fetched", { permissions });
  };

  setPermissionsHandler = async (c: Context) => {
    const user = c.get("user_payload");
    const subId = Number(c.req.param("id"));
    paramsValidateException.validateId(subId, "sub-user id");
    const body = await c.req.json();
    const validated = v.parse(updatePermissionsSchema, body);
    await setSubUserPermissions(subId, user.id, validated.permissions);
    return sendResponse(c, 200, "Permissions updated");
  };
}
```

---

### sub-user-routes.ts

```ts
import factory from "../factory.js";
import { SubUserHandlers } from "../handlers/sub-user-handlers.js";
import { isAuthorized } from "../middlewares/isAuthorized.js";
import { isUser } from "../middlewares/guards/guardUser.js";

const handlers = new SubUserHandlers();
const subUserRoutes = factory.createApp();

subUserRoutes.use("*", isAuthorized);
subUserRoutes.use("*", isUser);   // only primary USER accounts can manage sub-users

subUserRoutes.get("/",                handlers.listSubUsersHandler);
subUserRoutes.post("/",               handlers.createSubUserHandler);
subUserRoutes.delete("/:id",          handlers.deleteSubUserHandler);
subUserRoutes.get("/:id/permissions", handlers.getPermissionsHandler);
subUserRoutes.put("/:id/permissions", handlers.setPermissionsHandler);

export default subUserRoutes;
```

---

### Mount in index-routes.ts

```ts
import subUserRoutes from "./sub-user-routes.js";

indexRoute.route("/sub-users", subUserRoutes);
```

---

## Step 4 — API Reference

| Method | Endpoint | Guard | Purpose |
|---|---|---|---|
| `GET` | `/sub-users` | JWT + USER | List sub-users under caller |
| `POST` | `/sub-users` | JWT + USER | Create a new sub-user |
| `DELETE` | `/sub-users/:id` | JWT + USER | Soft-delete (ARCHIVED) |
| `GET` | `/sub-users/:id/permissions` | JWT + USER | Get sub-user's permissions array |
| `PUT` | `/sub-users/:id/permissions` | JWT + USER | Set sub-user's permissions array |

---

## Step 5 — Add `requirePermission` to existing routes

Regular `USER` and `ADMIN` accounts skip the check and pass freely.

```ts
import { requirePermission } from "../middlewares/guards/requirePermission.js";

// Motor routes
motorRoutes.post("/control", isAuthorized, requirePermission("MOTOR_CONTROL"), handlers.controlMotor);
motorRoutes.put("/mode",     isAuthorized, requirePermission("MODE_CONTROL"),   handlers.changeMode);

// Analytics / logs
analyticsRoutes.get("/",     isAuthorized, requirePermission("REPORTS_VIEW"),   analyticsHandlers.getAnalytics);
activityRoutes.get("/",      isAuthorized, requirePermission("LOGS_VIEW"),      activityHandlers.getActivities);
```

---

## Implementation Order

1. Add `SUB_USER` to `userTypeEnum` in `enum-types.ts`
2. Add `parent_id` column to `users` schema
3. Create `sub-user-permissions.ts` schema
4. Run `npm run db:gen && npm run db:apply`
5. Create `sub-user-services.ts`
6. Create `sub-user-handlers.ts`
7. Create `requirePermission.ts` guard
8. Create `sub-user-routes.ts` and mount in `index-routes.ts`
9. Add `requirePermission(...)` to motor / analytics / activity routes
