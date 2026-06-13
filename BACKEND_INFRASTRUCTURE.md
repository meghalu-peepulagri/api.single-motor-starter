# Backend Infrastructure Overview

**Platform:** Railway  
**Account:** Suresh Bala (bsureshbala@gmail.com)  
**Last updated:** 2026-06-13

---

## 1. Technologies Used

### Runtime & Framework

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (via `tsx` for dev, compiled `tsc` for production) |
| **Framework** | Hono v4 (`@hono/node-server`) |
| **ORM** | Drizzle ORM v0.43–0.44 |
| **Validation** | Valibot v1 |
| **Language** | TypeScript (compiled to `dist/`) |

### Data & Messaging

| Service | Technology |
|---|---|
| **Primary DB** | PostgreSQL (Aiven Cloud — external, not Railway-managed) |
| **Auth hashing** | Argon2 |
| **Real-time IoT** | MQTT v5 (EMQX Cloud broker — external) |
| **File storage** | AWS S3 (`@aws-sdk/client-s3`) |
| **Push notifications** | Firebase Admin SDK |
| **SMS** | MSG91 |

---

## 2. Deployed Backend Projects

Each backend project corresponds to a frontend admin app deployed on Vercel.

### Project Map

| Railway Project | Frontend App | Dev Domain | Port |
|---|---|---|---|
| `api.single-starter.com` | admin-app-singlestarter | dev-api-idhara.peepul.farm | 4545 |
| `api-iotsoftstarter` | admin-app-iotsoftstarter | dev-api-iot.peepul.farm | 3001 |
| `api.apfc.peepul.farm` | apfc-app | dev-api-apfc-v2.peepul.farm | 3000 |
| `api.sedyam.com` | admin-app-sedyam | — | — |
| `api-demeter-cloud` | app-demetercloud | — | — |
| `api.orc.com` | app.orc.com | — | — |
| `api-pa-ats` | app-ats-com | — | — |

---

## 3. Services Per Project

### api.single-starter.com

**Purpose:** IoT motor single-starter management — device telemetry, schedules, user auth, notifications.

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono, env: `development` |
| **PostgreSQL** | Aiven Cloud | `pg-194183cc-psripriya20-8a24.j.aivencloud.com:10222`, region: Mumbai (ap-south-1) |
| **MQTT Broker** | EMQX Cloud | `mqtts://e0be1176.ala.asia-southeast1.emqxsl.com`, region: Singapore |
| **S3 Storage** | AWS S3 | Bucket: `dev-demeter-cloud`, region: `ap-south-1` (Mumbai) |
| **Push** | Firebase | Project: `idhara-7c6cb` (FCM) |
| **SMS** | MSG91 | OTP/alerts |

```
Public URL : dev-api-idhara.peepul.farm
Railway internal: api-single-starter-com.railway.internal
Railway Project ID: 4d43c7d1-ecdf-4553-ab3a-ec569a35683e
```

---

### api-iotsoftstarter

**Purpose:** IoT soft-starter management — motor control, monitoring, alerts.

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono, env: `development` |
| **PostgreSQL** | Aiven Cloud | `pg-2a0407e6-priyankakommani-*.j.aivencloud.com:18182` |
| **MQTT Broker** | EMQX Cloud | `mqtts://aeef18e4.ala.asia-*.emqxsl.com` |

```
Public URL : dev-api-iot.peepul.farm
Railway Project ID: 1fdc7154-fda7-4c3b-8d17-8e830ec16fd5
```

---

### api.apfc.peepul.farm

**Purpose:** APFC (Automatic Power Factor Correction) device management.

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono, env: `production` |
| **PostgreSQL** | Aiven Cloud | External Aiven instance |
| **MQTT Broker** | EMQX Cloud | `mqtts://h42c786f.ala.asia-*.emqxsl.com` |

```
Public URL : dev-api-apfc-v2.peepul.farm
Railway Project ID: fd614f74-0b6e-4be5-9604-2127967667cf
```

---

### api.sedyam.com

**Purpose:** Sedyam platform backend — farm/device management.

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono |
| **PostgreSQL** | Aiven Cloud | External instance |
| **MQTT Broker** | EMQX Cloud | External instance |
| **S3 Storage** | AWS S3 | ap-south-1 |
| **Push** | Firebase Admin SDK | FCM |

*Stack matches api.single-starter.com (same Hono + Drizzle + MQTT + Firebase + S3 pattern).*

---

### api-demeter-cloud

**Purpose:** DemeterCloud platform backend — environmental monitoring, maps, analytics.

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono |
| **PostgreSQL** | Aiven Cloud | External instance |
| **MQTT Broker** | EMQX Cloud | External instance |
| **S3 Storage** | AWS S3 | ap-south-1 |

---

### api.orc.com

**Purpose:** ORC platform backend — operations/resource/control management.

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono |
| **PostgreSQL** | Aiven Cloud | External instance |
| **S3 Storage** | AWS S3 | ap-south-1 |

*No MQTT/Firebase dependency — this is a non-IoT service.*

---

### api-pa-ats

**Purpose:** PA-ATS (Automatic Transfer Switch) backend — device management, ATS control.

#### Development Environment

| Service | Provider | Details |
|---|---|---|
| **API** | Railway | Node.js/Hono, PORT 3000, NODE_ENV: development |
| **PostgreSQL (primary)** | Neon Cloud | `ep-fancy-feather-a1t5361u-pooler.ap-southeast-1.aws.neon.tech`, DB: `dev-pa-ats` |
| **PostgreSQL (Railway)** | Railway Postgres | Internal: `postgres.railway.internal:5432`, External: `nozomi.proxy.rlwy.net:57085` |
| **S3 Storage** | AWS S3 | Bucket: `dev-demeter-cloud`, region: `ap-south-1` |

```
API Public URL   : dev-api-ats.up.railway.app
Railway internal : api-pa-ats.railway.internal
Railway Postgres : postgres-development-151c.up.railway.app
Project ID       : 18971836-e66d-4a69-bb21-1dd4215a793c
API Service ID   : 037ebf09-0369-4405-9d29-7fe705c33d2d
DB Service ID    : 64ea41b1-cff8-4c46-ac3b-ac7d95ef7dc5
```

*No MQTT or Firebase dependency — ATS is a non-real-time control service.*

---

### PA-IOT-DB (Standalone Railway Database Project)

**Purpose:** Shared Railway-managed PostgreSQL instance for PA/IoT backend services. Separate project from `api-pa-ats`, providing isolated database hosting with both dev and production environments.

```
Railway Project ID: 645b5cbd-9f40-41fb-87c1-e5d60827e6d5
Service ID        : be5cbe61-ee67-433c-aef4-e79ddaec52a6
Volume            : ravishing-volume (shared across environments)
Volume ID         : 8becffe5-fab0-4b3e-8d62-244f64e2e400
Mount path        : /var/lib/postgresql/data
```

#### Development Environment

| Item | Value |
|---|---|
| Internal host | `postgres.railway.internal:5432` |
| External (TCP proxy) | `maglev.proxy.rlwy.net:29213` |
| Database | `railway` |
| User | `postgres` |
| Environment ID | `92af48e3-509a-4908-b348-32a444cb407a` |

#### Production Environment

| Item | Value |
|---|---|
| Internal host | `postgres.railway.internal:5432` |
| External (TCP proxy) | `switchback.proxy.rlwy.net:47114` |
| Database | `railway` |
| User | `postgres` |
| Environment ID | `016e5a72-caa5-4b44-8955-03c43e9a06e4` |

> Both environments share the same persistent volume (`ravishing-volume`). The TCP proxy domain/port differs between dev and production, but the underlying data volume is the same physical disk.

---

## 4. Where Is Code Deployed?

All APIs run on **Railway** as containerized Node.js services.

```
Developer pushes to GitHub
         ↓
Railway detects push on tracked branch
         ↓
Railway builds Docker container (auto-detects Node.js)
    → npm install
    → npm run build  (tsc → dist/)
         ↓
Container deployed to Railway cloud
         ↓
Public domain assigned → traffic served
```

- Railway environment: **development** (most projects) or **production**
- Railway region: Singapore / Asia-Southeast (inferred from EMQX broker regions, co-located for low MQTT latency)
- Deployment trigger: git push to linked branch
- No Dockerfile needed — Railway uses Nixpacks auto-detection

---

## 5. Service Costs (Per Project)

### Railway — API Service

Railway charges based on actual resource consumption:

| Resource | Rate |
|---|---|
| vCPU | $0.000463 / vCPU-min |
| RAM | $0.000231 / GB-min |
| Network egress | $0.10 / GB |
| Disk | $0.000022 / GB-min |

**Typical IoT API allocation (per service per month):**

| Resource | Allocation | Monthly Cost |
|---|---|---|
| vCPU | 0.1 vCPU × 43,200 min | ~$2.00 |
| RAM | 256 MB × 43,200 min | ~$2.49 |
| Network | ~1 GB egress | ~$0.10 |
| **Subtotal per service** | | **~$4.60/month** |

Railway Hobby plan includes **$5 free credit/month per workspace**. Projects within the credit limit cost $0.

### Aiven PostgreSQL

Aiven charges based on plan tier. Estimated:

| Plan | RAM | Storage | Price |
|---|---|---|---|
| Hobby (Startup-1) | 1 GB | 5 GB | ~$19/month |
| Business-4 | 4 GB | 80 GB | ~$99/month |

Multiple projects share Aiven instances (DB-per-schema pattern visible in vars).

### EMQX Cloud

EMQX Serverless plan: pay-per-use.

| Metric | Rate |
|---|---|
| Session minutes | $0.00008 / session-min |
| Traffic | $0.15 / GB |

Estimated at low IoT device count (<100 devices): **~$5–15/month per broker instance**.

### AWS S3

| Metric | Rate |
|---|---|
| Storage | $0.023 / GB-month |
| PUT/GET requests | $0.005 / 1,000 requests |

Estimated (firmware + media uploads): **~$1–5/month**.

### Firebase FCM

**Free** — FCM push notifications have no cost at any volume.

### MSG91

Pay-per-SMS. India domestic OTP: ₹0.15–0.20 per SMS.

---

## 6. Estimated Monthly Cost Summary

| Service | Provider | Monthly Est. |
|---|---|---|
| 7 × Railway API services | Railway | ~$0 (within $5 Hobby credit per workspace) |
| PostgreSQL (2–3 instances) | Aiven | $38–$60 |
| MQTT Brokers (3 instances) | EMQX Cloud | $15–$45 |
| File Storage | AWS S3 | $2–$10 |
| Push Notifications | Firebase | $0 |
| SMS OTP | MSG91 | ₹200–500 (~$3–6) |
| **Total estimate** | | **~$58–$121/month** |

> The largest cost driver is **Aiven PostgreSQL**, not Railway itself.  
> Railway API hosting is essentially free within the $5/month Hobby credit.

---

## 7. CI/CD Pipeline

```
GitHub (meghalu-peepulagri / peepulagri-bootstrap)
         ↓  git push → tracked branch
Railway webhook triggers
         ↓
Railway Nixpacks build
  → npm install
  → npm run build  (tsc)
         ↓
Container starts: node dist/src/index.js
         ↓
Health check passes → traffic shifted to new deployment
```

- **No Docker file** — Railway auto-detects Node.js + TypeScript
- **No GitHub Actions** — Railway's own CI handles builds
- **Environment variables** set directly in Railway dashboard per service
- **Branch → environment:** typically `dev` branch → development, `main` → production

---

## 8. External Services Summary

| Service | Provider | Region | Purpose |
|---|---|---|---|
| **PostgreSQL** | Aiven Cloud | Mumbai (ap-south-1) | Primary database |
| **MQTT** | EMQX Cloud | Singapore (asia-southeast1) | IoT device real-time messaging |
| **File storage** | AWS S3 | Mumbai (ap-south-1) | Device images, firmware, media |
| **Push notifications** | Firebase (Google) | Global | Mobile push via FCM |
| **SMS** | MSG91 | India | OTP / alert SMS |
| **Source control** | GitHub | Global | Code hosting + Railway CD trigger |

All data-at-rest is in **India (Mumbai)** region. Real-time IoT traffic routes through **Singapore** EMQX brokers for lower Asia-Pacific latency.
