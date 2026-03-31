# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Node.js TypeScript backend API for **iDhara** — an IoT-based agricultural motor (water pump) control platform. Motors are managed remotely via MQTT-connected hardware devices called "starter boxes."

## Commands

```bash
npm run dev          # Development server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled production build
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix

npm run db:gen       # Generate Drizzle ORM migrations
npm run db:apply     # Apply pending migrations
npm run db:studio    # Open Drizzle Studio (database browser)
npm run logs         # View/filter application logs
```

No test suite is configured.

## Architecture

**Stack:** Hono (HTTP framework) + Drizzle ORM + PostgreSQL + MQTT (EMQX broker)

**Request flow:**
```
HTTP Request → Routes → Handlers (validation + business logic) → DB Services → Drizzle ORM → PostgreSQL
                                                                                    ↑
MQTT Broker ↔ mqtt-service.ts ──────────────────────────────────→ mqtt-db-services.ts
```

**Key directories:**
- `src/routes/` — Hono route definitions; aggregated in `index-routes.ts`
- `src/handlers/` — Business logic (controller layer); one file per domain
- `src/services/db/` — Database query layer; `mqtt-db-services.ts` (41KB) is the largest, handling all inbound MQTT message persistence
- `src/database/schemas/` — 22 Drizzle table definitions
- `src/config/` — One file per external service (JWT, MQTT, FCM, S3, SMS)
- `src/helpers/` — Pure utility functions; `packet-types-helper.ts` identifies MQTT packet types
- `src/constants/app-constants.ts` — Large constants file (29KB); check here before hardcoding values
- `src/validations/schema/` — Valibot schemas for request validation
- `src/middlewares/` — JWT auth (`isAuthorized.ts`), API logger, role guards
- `migrations/` — Drizzle-generated SQL migration files (35+)

**Core domain entities:**
- `starter_boxes` — Physical IoT hardware devices
- `motors` — Virtual motor representations linked to starter boxes
- `motor_schedules` — Automated on/off scheduling
- `device_runtime` / `motor_runtime` — Operation time tracking
- `alerts_faults` — Fault/alert history from devices

## MQTT Communication

The server connects to an EMQX broker on startup (`src/index.ts`). All real-time device communication goes through `src/services/mqtt-service.ts`, which routes incoming packets to handlers in `mqtt-db-services.ts`. Outbound commands (turn motor on/off, update settings) are published via helpers in `src/helpers/mqtt-helpers.ts`.

## Database

PostgreSQL with SSL (ca.pem certificate). Connection configured in `src/database/configuration.ts` using `pg` connection pool + Drizzle ORM.

All environment variables are validated at startup via a Valibot schema in `src/env.ts`. Required vars include: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`, `JWT_SECRET`, `EMQX_API_KEY`, `EMQX_USERNAME`, `EMQX_PASSWORD`, `EMQX_CLIENT_ID`, `MSG91_SMS_API_KEY`, `MSG91_SMS_TEMPLATE_ID`, FCM credentials (10 vars), and AWS S3 credentials.

## Authentication

JWT-based auth with 10-day expiration. OTP flow via MSG91 SMS for registration/login. Role-based access: `ADMIN` and `USER` roles enforced via middleware guards in `src/middlewares/guards/`.

## Response Format

All responses use a standard formatter from `src/utils/send-response.ts`. HTTP status codes are defined in `src/constants/http-status-codes.ts`.
