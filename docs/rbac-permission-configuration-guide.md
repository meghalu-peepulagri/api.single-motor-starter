# RBAC Permission Configuration Guide

**Project:** peepulagri-api (Single Motor Starter)
**Date:** 2026-05-27
**Stack:** Hono v4 · Drizzle ORM v0.44 · PostgreSQL

---

## Table of Contents

1. [Two Ways to Grant Permissions](#1-two-ways-to-grant-permissions)
2. [All 7 Permissions Reference](#2-all-7-permissions-reference)
3. [All 6 Predefined Roles Reference](#3-all-6-predefined-roles-reference)
4. [How Effective Permissions Are Resolved](#4-how-effective-permissions-are-resolved)
5. [The Core Rule](#5-the-core-rule)
6. [Configuration Examples](#6-configuration-examples)
7. [Decision Flow](#7-decision-flow)
8. [Quick Decision Table](#8-quick-decision-table)

---

## 1. Two Ways to Grant Permissions

Every sub-user's access is built from two sources:

### Roles
Pre-defined permission bundles. One role assignment gives multiple permissions at once.

```
Assign role SCHEDULER
→ automatically gets: SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
```

**Use roles when:** the sub-user fits a standard use case (field operator, schedule manager, etc.).

---

### Direct Permissions
Individual permissions granted one by one, completely independent of any role.

```
Grant direct: MOTOR_CONTROL
→ gets exactly: MOTOR_CONTROL — nothing else
```

**Use direct permissions when:** the sub-user needs a very specific subset that no role covers exactly.

---

### You Can Mix Both

```
Role:   TECHNICIAN     →  SETTINGS_VIEW, SETTINGS_MANAGEMENT, REPORTS_VIEW
Direct: MOTOR_CONTROL  →  MOTOR_CONTROL
                       ─────────────────────────────────────────────
Effective              =  SETTINGS_VIEW, SETTINGS_MANAGEMENT,
                          REPORTS_VIEW, MOTOR_CONTROL
```

---

## 2. All 7 Permissions Reference

| Permission | What it allows |
|-----------|----------------|
| `MOTOR_CONTROL` | Turn motor ON / OFF (MQTT T:1 command) |
| `MODE_CONTROL` | Change mode — AUTO / MANUAL / SCHEDULE (MQTT T:2) |
| `SCHEDULE_VIEW` | View and read schedules |
| `SCHEDULE_MANAGEMENT` | Create, edit, delete, publish, stop, restart schedules |
| `SETTINGS_VIEW` | View device settings and thresholds |
| `SETTINGS_MANAGEMENT` | Update device settings |
| `REPORTS_VIEW` | View analytics, run-time history, alerts, faults, status history |

---

## 3. All 6 Predefined Roles Reference

Roles are **defined in code** (`src/constants/role-permissions.ts`) — not user-configurable.

| Role | Permissions Included | Typical Sub-User |
|------|---------------------|-----------------|
| `VIEWER` | `SCHEDULE_VIEW`, `SETTINGS_VIEW`, `REPORTS_VIEW` | Read-only monitor |
| `OPERATOR` | `MOTOR_CONTROL`, `MODE_CONTROL` | Field operator — on/off + mode |
| `SCHEDULER` | `SCHEDULE_VIEW`, `SCHEDULE_MANAGEMENT` | Manages pump schedules |
| `TECHNICIAN` | `SETTINGS_VIEW`, `SETTINGS_MANAGEMENT`, `REPORTS_VIEW` | Configures device settings |
| `CONTROLLER` | `MOTOR_CONTROL`, `SETTINGS_VIEW`, `SETTINGS_MANAGEMENT`, `SCHEDULE_VIEW`, `SCHEDULE_MANAGEMENT` | Full operations — motor + settings + schedules, no mode, no reports |
| `FULL_ACCESS` | All 7 permissions | Fully trusted user |

A sub-user can hold **multiple roles** at the same time.

---

## 4. How Effective Permissions Are Resolved

```
effective = union( all role permissions ) + union( direct grants )
```

No duplicates. No subtraction. Pure union of everything assigned.

### Example

Sub-user has roles `["OPERATOR", "SCHEDULER"]` and direct grant `["REPORTS_VIEW"]`:

```
OPERATOR   role  →  MOTOR_CONTROL, MODE_CONTROL
SCHEDULER  role  →  SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
Direct          →   REPORTS_VIEW
                ─────────────────────────────────────────
Effective       =   MOTOR_CONTROL, MODE_CONTROL,
                    SCHEDULE_VIEW, SCHEDULE_MANAGEMENT,
                    REPORTS_VIEW
```

API response from `GET /sub-users/42/effective-permissions`:

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

Any permission **not in the effective list** returns **403 Forbidden** when the sub-user attempts that action.

---

## 5. The Core Rule

> **Roles are additive only. You can never use a role to subtract a permission.**
>
> If a role contains a permission you do NOT want the sub-user to have —
> do not assign that role. Use direct grants instead for precise control.

### Example of what goes wrong

You want `MOTOR_CONTROL` but NOT `MODE_CONTROL`.

❌ Wrong — assigning `OPERATOR` also gives `MODE_CONTROL`:
```
OPERATOR → MOTOR_CONTROL ✅  +  MODE_CONTROL ❌ (unwanted, but you cannot remove it)
```

✅ Correct — skip the role, use direct grant only:
```
Roles:  []
Direct: ["MOTOR_CONTROL"]
→ Effective: MOTOR_CONTROL only
```

---

## 6. Configuration Examples

---

### Example 1 — View only (read everything, control nothing)

The sub-user can only read — no motor control, no mode change, no edits.

```
Roles:  ["VIEWER"]
Direct: []

VIEWER  →  SCHEDULE_VIEW, SETTINGS_VIEW, REPORTS_VIEW
        ────────────────────────────────────────────────
Effective: SCHEDULE_VIEW, SETTINGS_VIEW, REPORTS_VIEW
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": ["VIEWER"] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": [] }
```

---

### Example 2 — Motor ON/OFF + Mode change

The sub-user can operate the motor and switch mode. Nothing else.

```
Roles:  ["OPERATOR"]
Direct: []

OPERATOR  →  MOTOR_CONTROL, MODE_CONTROL
          ───────────────────────────────
Effective: MOTOR_CONTROL, MODE_CONTROL
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": ["OPERATOR"] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": [] }
```

---

### Example 3 — Motor ON/OFF only (no mode change)

The sub-user can turn the motor on/off but cannot change the mode.

`OPERATOR` is **wrong** — it includes `MODE_CONTROL`.
Solution: skip roles, use one direct grant.

```
Roles:  []
Direct: ["MOTOR_CONTROL"]

Effective: MOTOR_CONTROL
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": [] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": ["MOTOR_CONTROL"] }
```

```json
{
  "roles": [],
  "direct_permissions": ["MOTOR_CONTROL"],
  "effective_permissions": ["MOTOR_CONTROL"]
}
```

`MODE_CONTROL` absent → mode change = **403**.

---

### Example 4 — Schedule VIEW only (cannot manage schedules)

The sub-user can see schedules but cannot create, edit, or delete them.

`SCHEDULER` is **wrong** — it includes `SCHEDULE_MANAGEMENT`.
Solution: skip roles, one direct grant.

```
Roles:  []
Direct: ["SCHEDULE_VIEW"]

Effective: SCHEDULE_VIEW
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": [] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": ["SCHEDULE_VIEW"] }
```

```json
{
  "roles": [],
  "direct_permissions": ["SCHEDULE_VIEW"],
  "effective_permissions": ["SCHEDULE_VIEW"]
}
```

`SCHEDULE_MANAGEMENT` absent → create/edit/delete schedule = **403**.

---

### Example 5 — Motor control + Settings VIEW only (cannot update settings, no mode)

The sub-user can turn motor on/off and view settings, but cannot update settings or change mode.

- `OPERATOR` is **wrong** — adds `MODE_CONTROL`
- `TECHNICIAN` is **wrong** — adds `SETTINGS_MANAGEMENT` + `REPORTS_VIEW`

Solution: skip roles, two direct grants.

```
Roles:  []
Direct: ["MOTOR_CONTROL", "SETTINGS_VIEW"]

Effective: MOTOR_CONTROL, SETTINGS_VIEW
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": [] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": ["MOTOR_CONTROL", "SETTINGS_VIEW"] }
```

```json
{
  "roles": [],
  "direct_permissions": ["MOTOR_CONTROL", "SETTINGS_VIEW"],
  "effective_permissions": ["MOTOR_CONTROL", "SETTINGS_VIEW"]
}
```

`MODE_CONTROL`, `SETTINGS_MANAGEMENT`, `SCHEDULE_VIEW`, `REPORTS_VIEW` all absent → **403** for each.

---

### Example 6 — Motor control + Settings management + Schedule management (no mode, no reports)

The sub-user manages everything operational but has no visibility into reports and no mode control.

Use `CONTROLLER` role — exact fit, no extras.

```
Roles:  ["CONTROLLER"]
Direct: []

CONTROLLER  →  MOTOR_CONTROL, SETTINGS_VIEW, SETTINGS_MANAGEMENT,
               SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
            ──────────────────────────────────────────────────────
Effective   =  MOTOR_CONTROL, SETTINGS_VIEW, SETTINGS_MANAGEMENT,
               SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": ["CONTROLLER"] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": [] }
```

```json
{
  "roles": ["CONTROLLER"],
  "direct_permissions": [],
  "effective_permissions": [
    "MOTOR_CONTROL",
    "SETTINGS_VIEW",
    "SETTINGS_MANAGEMENT",
    "SCHEDULE_VIEW",
    "SCHEDULE_MANAGEMENT"
  ]
}
```

`MODE_CONTROL` and `REPORTS_VIEW` absent → **403** for each.

---

### Example 7 — Motor control + Settings management + Schedule VIEW only (no schedule manage, no mode)

The sub-user can operate the motor, configure settings, and view schedules — but cannot manage schedules or change mode.

`CONTROLLER` is **wrong** — it includes `SCHEDULE_MANAGEMENT`.
Solution: `TECHNICIAN` role + direct grants for motor and schedule view.

```
TECHNICIAN  →  SETTINGS_VIEW, SETTINGS_MANAGEMENT, REPORTS_VIEW
Direct      →  MOTOR_CONTROL, SCHEDULE_VIEW
            ──────────────────────────────────────────────────────
Effective   =  SETTINGS_VIEW, SETTINGS_MANAGEMENT, REPORTS_VIEW,
               MOTOR_CONTROL, SCHEDULE_VIEW
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": ["TECHNICIAN"] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": ["MOTOR_CONTROL", "SCHEDULE_VIEW"] }
```

```json
{
  "roles": ["TECHNICIAN"],
  "direct_permissions": ["MOTOR_CONTROL", "SCHEDULE_VIEW"],
  "effective_permissions": [
    "SETTINGS_VIEW",
    "SETTINGS_MANAGEMENT",
    "REPORTS_VIEW",
    "MOTOR_CONTROL",
    "SCHEDULE_VIEW"
  ]
}
```

`MODE_CONTROL` and `SCHEDULE_MANAGEMENT` absent → **403** for each.

---

### Example 8 — Motor + Schedules, no settings

The sub-user operates the motor, manages schedules, and changes mode. No settings access.

```
Roles:  ["OPERATOR", "SCHEDULER"]
Direct: []

OPERATOR   →  MOTOR_CONTROL, MODE_CONTROL
SCHEDULER  →  SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
           ──────────────────────────────────────
Effective  =  MOTOR_CONTROL, MODE_CONTROL,
              SCHEDULE_VIEW, SCHEDULE_MANAGEMENT
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": ["OPERATOR", "SCHEDULER"] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": [] }
```

`SETTINGS_VIEW`, `SETTINGS_MANAGEMENT`, `REPORTS_VIEW` absent → **403** for each.

---

### Example 9 — Full trusted user (everything)

```
Roles:  ["FULL_ACCESS"]
Direct: []

Effective: all 7 permissions
```

```http
PUT /api/v1/sub-users/42/roles
{ "roles": ["FULL_ACCESS"] }

PUT /api/v1/sub-users/42/permissions
{ "permissions": [] }
```

---

## 7. Decision Flow

Use this flow every time you configure a new sub-user's permissions.

```
START: What does this sub-user need?
              │
              ▼
    Does a predefined role match EXACTLY?
    (check: does the role give ONLY what's needed, nothing unwanted)
              │
      YES ────┤────► Assign that role. Done.
              │      PUT /roles → { "roles": ["ROLE_NAME"] }
              │
      NO  ────┤
              │
              ▼
    Does a role cover MOST of the need?
    (check: does the role include ANY permission you want BLOCKED?)
              │
      YES and role has NO unwanted permissions ──►
              │    Use that role + direct grants for the missing ones.
              │    PUT /roles → { "roles": ["ROLE"] }
              │    PUT /permissions → { "permissions": ["MISSING_1", ...] }
              │
      Role has unwanted permissions ──►
              │    Do NOT use that role.
              │    Fall through to direct-only.
              │
      NO  ────┤
              │
              ▼
    Skip roles entirely.
    List exactly the permissions this sub-user needs — no more, no less.
    PUT /roles       → { "roles": [] }
    PUT /permissions → { "permissions": ["PERM_1", "PERM_2", ...] }
```

---

## 8. Quick Decision Table

| Sub-user needs | Roles | Direct grants |
|----------------|-------|---------------|
| View everything (read-only) | `VIEWER` | — |
| Motor ON/OFF + mode change | `OPERATOR` | — |
| Motor ON/OFF only (no mode) | — | `MOTOR_CONTROL` |
| Mode change only | — | `MODE_CONTROL` |
| Schedule VIEW only | — | `SCHEDULE_VIEW` |
| Schedule manage (view + manage) | `SCHEDULER` | — |
| Settings VIEW only | — | `SETTINGS_VIEW` |
| Settings manage (view + manage + reports) | `TECHNICIAN` | — |
| Motor + Settings VIEW only | — | `MOTOR_CONTROL`, `SETTINGS_VIEW` |
| Motor + Settings + Schedules (all manage, no mode, no reports) | `CONTROLLER` | — |
| Motor + Settings manage + Schedule VIEW only | `TECHNICIAN` | `MOTOR_CONTROL`, `SCHEDULE_VIEW` |
| Motor + Mode + Schedules, no settings | `OPERATOR` + `SCHEDULER` | — |
| Motor + Mode + Settings + Schedules, no reports | `OPERATOR` + `SCHEDULER` + `TECHNICIAN` | — |
| Everything | `FULL_ACCESS` | — |

---

## 9. Important Notes

| Note | Detail |
|------|--------|
| Sub-user starts with zero access | No roles, no direct permissions until explicitly assigned |
| Permission check is per-request | Roles fetched from DB on every request — no re-login needed after change |
| Direct permissions are additive | They stack on top of roles — cannot override or remove a role's permission |
| Roles cannot subtract | If a role includes an unwanted permission — do not use that role |
| Multiple roles = union | Assigning two roles gives ALL permissions from both |
| `FULL_ACCESS` = shortcut | Assigns all 7 permissions without listing them individually |
| `CONTROLLER` = operations role | Motor + Settings + Schedules — for users who manage day-to-day operations without analytics or mode access |
| Primary user is unaffected | `requirePermission` makes zero DB queries for non-`SUB_USER` types |
