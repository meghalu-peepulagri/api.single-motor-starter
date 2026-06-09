# Idhara — Backend Infrastructure Document

---

## 1. Technologies Used

| Layer              | Technology                        |
|--------------------|-----------------------------------|
| Runtime            | Node.js                           |
| Framework          | Hono v4 (`@hono/node-server`)     |
| ORM                | Drizzle ORM v0.44                 |
| Database           | PostgreSQL                        |
| Validation         | Valibot v1                        |
| Auth               | Argon2 (password hashing)         |
| Real-time          | MQTT v5 (via EMQX broker)         |
| Storage            | AWS S3 (`@aws-sdk/client-s3`)     |
| Push Notifications | Firebase Admin SDK                |
| Language           | TypeScript                        |

---

## 2. Where is the Backend Code Deployed?

| Environment     | URL                                                      |
|-----------------|----------------------------------------------------------|
| Development     | https://dev-api-idhara.peepul.farm                       |
| Platform        | Railway (`*.up.railway.app`)                             |
| Local Dev Tunnel| VS Code Dev Tunnel (port 4545)                           |

The backend is deployed on **Railway** with a custom domain `dev-api-idhara.peepul.farm`
pointing to the Railway service.

---

## 3. Services Used & Where They Are Deployed

| Service             | Provider                  | Region                          | Purpose                              |
|---------------------|---------------------------|---------------------------------|--------------------------------------|
| Backend API         | Railway                   | Cloud (auto-assigned)           | REST API server (Hono)               |
| PostgreSQL          | Railway (Postgres plugin) | Same as API                     | Primary database                     |
| MQTT Broker         | EMQX Cloud                | Asia Southeast 1 (Singapore)    | IoT device real-time communication   |
| File Storage        | AWS S3                    | As per `AWS_S3_BUCKET_REGION`   | Device images, file uploads          |
| Push Notifications  | Firebase FCM              | Google Cloud (global)           | Mobile push notifications            |
| SMS / OTP           | MSG91                     | India                           | OTP delivery via SMS                 |

---

## 4. Costs Incurred Based on Request Volume & Storage Usage

### Railway (Actual — May 7 to Jun 6, 30 days)

| Metric          | Observed Value                                         | Cost Impact     |
|-----------------|--------------------------------------------------------|-----------------|
| Total Requests  | 72,500 requests / 30 days (~2,400/day)                 | No per-request charge |
| CPU Usage       | ~0.0 vCPU (nearly flat)                                | ~$0.10          |
| Memory          | Baseline ~100 MB, spikes to 500–600 MB                 | ~$1.50          |
| Network Egress  | ~500 MB–1 GB / month                                   | ~$0.10          |
| Error Rate      | 10–20% of requests failing (needs investigation)       | No extra cost, but indicates application bugs |

### AWS S3

| Usage Type              | Rate                            |
|-------------------------|---------------------------------|
| Storage                 | $0.023 per GB/month             |
| PUT / POST requests     | $0.005 per 1,000 requests       |
| GET requests            | $0.0004 per 1,000 requests      |
| Data transfer out       | $0.09 per GB egress             |

### EMQX Cloud

| Usage           | Limit / Rate                            |
|-----------------|-----------------------------------------|
| Free tier       | 1,000,000 session minutes/month         |
| After free tier | $0.15 per million messages              |
| Current usage   | Within free tier (small IoT scale)      |

### MSG91

| Usage           | Rate                          |
|-----------------|-------------------------------|
| OTP SMS (India) | ₹0.10 – ₹0.25 per SMS         |
| Cost driver     | Number of OTP requests sent   |

---

## 5. Cost of Each Service

| Service       | Pricing Model                                                                                      | Free Tier                          |
|---------------|----------------------------------------------------------------------------------------------------|------------------------------------|
| Railway       | CPU ($0.000463/vCPU/min) + Memory ($0.000231/GB/min) + Egress ($0.10/GB)                          | $5 credit/month (Hobby plan)       |
| EMQX Cloud    | $0 up to 1M session minutes, then $0.15/M messages                                                | 1M session minutes/month           |
| AWS S3        | $0.023/GB storage + request fees + $0.09/GB egress                                                 | 5 GB free (first 12 months)        |
| Firebase FCM  | Free, no limits                                                                                    | Fully free                         |
| MSG91         | ₹0.10–₹0.25 per SMS                                                                               | None (pay-per-use)                 |

---

## 6. Monthly Cost Per Service & Total Infrastructure Cost

| Service                     | Estimated Monthly Cost                                      |
|-----------------------------|-------------------------------------------------------------|
| Railway (API + PostgreSQL)  | **$0** (within $5 free credit — actual bill ~$1.70)         |
| EMQX Cloud                  | **$0** (within free tier)                                   |
| AWS S3                      | **$1–$5** (depends on file volume and image downloads)      |
| Firebase FCM                | **$0** (completely free)                                    |
| MSG91                       | **₹50–₹500** (~$0.60–$6) depending on OTP volume           |
| **Total**                   | **~$1–$11 / month**                                         |

> At current scale (dev/small production), the entire Idhara backend infrastructure costs
> **under $10/month**, primarily driven by AWS S3 usage and SMS volume.

---

## 7. How to Monitor Each Service

| Service      | Where to Check                                                                 |
|--------------|--------------------------------------------------------------------------------|
| Railway      | [railway.app](https://railway.app) → Project → Metrics / Usage / Logs         |
| EMQX Cloud   | [cloud.emqx.com](https://cloud.emqx.com) → Cluster → Monitor tab              |
| AWS S3       | AWS Console → Billing → Cost Explorer → filter by S3                           |
| Firebase FCM | [console.firebase.google.com](https://console.firebase.google.com) → Cloud Messaging |
| MSG91        | [msg91.com](https://msg91.com) → Dashboard → Reports + Wallet                  |

---

*Document generated: June 2026*
*Project: Idhara — Single Motor Starter IoT Management Platform*
