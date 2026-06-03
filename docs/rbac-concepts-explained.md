# RBAC Concepts Explained — Roles, Direct Permissions & Effective Permissions

**Project:** peepulagri-api (Single Motor Starter)
**Date:** 2026-05-27

---

## The Big Picture

When a primary user creates a sub-user, that sub-user starts with **zero access** — they cannot do anything at all.

The primary user then decides what the sub-user is allowed to do by assigning:
- **Roles** — bundles of permissions
- **Direct permissions** — individual permissions

Both combine together to form the **effective permissions** — the final list of what the sub-user can actually do.

---

## What is a Role?

A role is a **named group of permissions**.

Instead of assigning 5 permissions one by one, you just assign one role name — and the sub-user automatically gets all permissions inside that role.

```
OPERATOR role contains:
  → MOTOR_CONTROL
  → MODE_CONTROL

You assign role OPERATOR to sub-user
→ sub-user automatically gets MOTOR_CONTROL and MODE_CONTROL
```

Think of it like a job title:
- You say "this person is an Operator"
- They automatically get everything an Operator needs
- You do not have to list each permission manually

### All available roles

| Role | Permissions it gives |
|------|---------------------|
| `VIEWER` | SCHEDULE_VIEW, SETTINGS_VIEW, REPORTS_VIEW |
| `OPERATOR` | MOTOR_CONTROL, MODE_CONTROL |
| `SCHEDULER` | SCHEDULE_VIEW, SCHEDULE_MANAGEMENT |
| `TECHNICIAN` | SETTINGS_VIEW, SETTINGS_MANAGEMENT, REPORTS_VIEW |
| `CONTROLLER` | MOTOR_CONTROL, SETTINGS_VIEW, SETTINGS_MANAGEMENT, SCHEDULE_VIEW, SCHEDULE_MANAGEMENT |
| `FULL_ACCESS` | All 7 permissions |

A sub-user can have **more than one role** at the same time.

---

## What is a Direct Permission?

A direct permission is a **single permission you grant individually** — completely separate from any role.

```
Direct grant: REPORTS_VIEW

Sub-user gets: REPORTS_VIEW only
Nothing else is added automatically
```

You use direct permissions when:
- No existing role fits exactly what you need
- A role gives too many permissions (includes something you do not want)
- You need just one or two specific permissions without a full role

### All available permissions

| Permission | What it allows |
|-----------|----------------|
| `MOTOR_CONTROL` | Turn motor ON / OFF |
| `MODE_CONTROL` | Change mode — AUTO / MANUAL / SCHEDULE |
| `SCHEDULE_VIEW` | View and read schedules |
| `SCHEDULE_MANAGEMENT` | Create, edit, delete schedules |
| `SETTINGS_VIEW` | View device settings |
| `SETTINGS_MANAGEMENT` | Update device settings |
| `REPORTS_VIEW` | View analytics, history, alerts, faults |

---

## What is Effective Permission?

Effective permission is the **final combined list** of everything the sub-user is allowed to do.

The system calculates it automatically like this:

```
effective = all permissions from all roles
          + all direct permissions
          (duplicates removed)
```

This is the only thing the system checks when the sub-user makes any request.

### Example

```
Sub-user has:
  Roles:  [OPERATOR, SCHEDULER]
  Direct: [REPORTS_VIEW]

  OPERATOR  gives →  MOTOR_CONTROL, MODE_CONTROL
  SCHEDULER gives →  SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
  Direct    gives →  REPORTS_VIEW

  ─────────────────────────────────────────────────
  Effective       =  MOTOR_CONTROL
                     MODE_CONTROL
                     SCHEDULE_VIEW
                     SCHEDULE_MANAGEMENT
                     REPORTS_VIEW
```

---

## What Happens When a Sub-User Logs In

### Step 1 — Login

Sub-user sends phone + password.

Server checks credentials and returns a JWT token.

The token contains:

```json
{
  "user_id": 42,
  "user_type": "SUB_USER",
  "parent_user_id": 7
}
```

> **Roles and permissions are NOT stored in the token.**
> They are fetched from the database on every request.
> This means if you change a sub-user's role — it takes effect immediately, no re-login needed.

---

### Step 2 — Sub-user makes a request

Sub-user tries to do something — for example, turn motor ON.

```
PATCH /api/v1/motors/5/control
Authorization: Bearer <token>
```

---

### Step 3 — Server checks the token

`isAuthorized` middleware reads the token.

Extracts:
```
user_id        = 42
user_type      = SUB_USER
parent_user_id = 7
```

---

### Step 4 — Server checks device access

`requireDeviceAccess` middleware checks:

```
Is device 5 owned by parent user 7?  →  YES, continue
Is sub-user 42 restricted to specific devices?
  → No rows in sub_user_device_scope  →  access all parent devices  →  continue
  → Rows exist  →  is device 5 in scope?  →  YES  →  continue  /  NO  →  403
```

---

### Step 5 — Server checks permission

`requirePermission("MOTOR_CONTROL")` middleware:

1. Fetches roles from `sub_user_role_assignments` where `sub_user_id = 42`
2. Expands each role into its permissions
3. Fetches direct grants from `sub_user_permissions` where `sub_user_id = 42`
4. Merges everything into one set — the effective permissions
5. Checks: is `MOTOR_CONTROL` in the set?

```
Effective permissions of sub-user 42:
  MOTOR_CONTROL ✅   ← found
  MODE_CONTROL
  SCHEDULE_VIEW
  SCHEDULE_MANAGEMENT
  REPORTS_VIEW

MOTOR_CONTROL is present → allowed → continue to handler
```

---

### Step 6 — Handler runs

The motor control handler executes normally.
The motor is turned ON.
Response returned to sub-user.

---

### What if permission is missing?

Sub-user 42 tries to update settings:

```
PATCH /api/v1/settings/5
```

`requirePermission("SETTINGS_MANAGEMENT")` checks effective permissions:

```
Effective permissions of sub-user 42:
  MOTOR_CONTROL
  MODE_CONTROL
  SCHEDULE_VIEW
  SCHEDULE_MANAGEMENT
  REPORTS_VIEW

SETTINGS_MANAGEMENT ❌   ← NOT found

→ 403 Forbidden: Permission denied: SETTINGS_MANAGEMENT
```

The handler never runs. Request is rejected.

---

## Full Flow Diagram

```
Sub-user login
      │
      ▼
POST /auth/login  →  JWT token returned
      │               { user_id, user_type: SUB_USER, parent_user_id }
      │
      │ (every subsequent request)
      │
      ▼
isAuthorized middleware
  reads token → sets user_payload on context
      │
      ▼
requireDeviceAccess middleware
  Is device owned by parent?          NO  →  403
  Is sub-user restricted to devices?
    No scope rows  →  all parent devices allowed
    Scope rows     →  is this device in scope?  NO  →  403
      │
      ▼  YES
requirePermission middleware
  Fetch roles from sub_user_role_assignments
  Expand roles → permissions
  Fetch direct grants from sub_user_permissions
  Merge → effective permission set
  Is required permission in set?      NO  →  403
      │
      ▼  YES
Handler executes
Response returned to sub-user
```

---

## Where Each Thing Lives in the Database

| Data | Table | What it stores |
|------|-------|---------------|
| Sub-user account | `users` | phone, password, parent_user_id, user_type = SUB_USER |
| Role assignments | `sub_user_role_assignments` | which roles the sub-user holds |
| Direct grants | `sub_user_permissions` | individual permissions granted directly |
| Device scope | `sub_user_device_scope` | which devices the sub-user can access (optional) |

---

## Where Each Thing Shows in the API

| What you want to see | API call |
|----------------------|----------|
| Sub-user's assigned roles | `GET /sub-users/42/roles` |
| Sub-user's direct permissions | `GET /sub-users/42/permissions` |
| Sub-user's final effective permissions | `GET /sub-users/42/effective-permissions` |
| Sub-user's device scope | `GET /sub-users/42/devices` |

### Sample response — effective permissions

```json
{
  "data": {
    "sub_user_id": 42,
    "roles": ["OPERATOR", "SCHEDULER"],
    "direct_permissions": ["REPORTS_VIEW"],
    "effective_permissions": [
      "MOTOR_CONTROL",
      "MODE_CONTROL",
      "SCHEDULE_VIEW",
      "SCHEDULE_MANAGEMENT",
      "REPORTS_VIEW"
    ]
  }
}
```

- `roles` — what roles are assigned
- `direct_permissions` — what individual permissions are granted on top of roles
- `effective_permissions` — the final merged list — this is what the system uses on every request

---

## Why Use Roles Instead of Just Direct Permissions?

| | Roles | Direct permissions |
|--|-------|--------------------|
| How many permissions | Multiple at once | One by one |
| Best for | Standard use cases that repeat | Precise, one-off needs |
| Example | 10 field operators → all get OPERATOR role | One sub-user needs MOTOR_CONTROL only |
| Maintenance | Change the role definition → all sub-users with that role are updated | Have to update each sub-user individually |

### Rule of thumb

- If the sub-user fits a standard job → use a role
- If the sub-user needs something very specific that no role covers exactly → use direct permissions
- If a role covers most of the need but gives one unwanted permission → **do not use that role**, use direct permissions instead

---

## The One Rule You Must Never Forget

> **Roles only add permissions. They never subtract.**
>
> Once a role is assigned, all its permissions are included — you cannot remove just one.
> If a role contains a permission you do not want — do not assign that role.

### Example

You want `MOTOR_CONTROL` but NOT `MODE_CONTROL`.

```
❌ Wrong:
   Assign OPERATOR role
   → gets MOTOR_CONTROL + MODE_CONTROL  (MODE_CONTROL is unwanted but you cannot remove it)

✅ Correct:
   Assign no role
   Direct grant: MOTOR_CONTROL only
   → gets exactly MOTOR_CONTROL, nothing else
```

---

## Summary in One Paragraph

A sub-user is created with zero access. The primary user assigns **roles** (bundles like OPERATOR or SCHEDULER) and/or **direct permissions** (individual grants like MOTOR_CONTROL). The system merges all of them together into **effective permissions** — the final set the sub-user actually has. On every request, the server checks this set. If the required permission is present → the request goes through. If not → 403. Roles are for convenience and standard cases. Direct permissions are for precision. Effective permissions are the result of both combined.
