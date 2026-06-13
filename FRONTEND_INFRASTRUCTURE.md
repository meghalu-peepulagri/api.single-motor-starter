# Infrastructure Overview

**Team:** peepulagri's projects
**Plan:** Vercel Hobby
**Last updated:** 2026-06-12

---

## 1. Technologies Used

### Frontend Frameworks

| Framework | Projects |
|---|---|
| **Vite + React** | simulator-app, all admin apps, orc, ats, demetercloud |
| **Next.js** | farmlogs-peepulfarm, apfc-app, ros-bot-streaming |
| **Astro** | idhara-com |
| **Static HTML/CSS** | peepulagri-com |

### Node.js Versions

| Version | Used By |
|---|---|
| 24.x | simulator-app, singlestarter, sedyam, orc, idhara-com |
| 22.x | iotsoftstarter, demetercloud, ats, farmlogs |
| 20.x | apfc-app, ros-bot-streaming, peepulagri-com |

### Language
All projects use **TypeScript** (except peepulagri-com which is plain HTML/CSS).

### Real-time & Services Stack
- **MQTT over WebSocket** — EMQX broker for IoT device communication
- **Supabase** — database + auth (simulator-app)
- **Firebase** — push notifications (demetercloud)
- **Mapbox GL** — maps (sedyam, iotsoftstarter)
- **Google Maps** — maps (demetercloud)

---

## 2. Deployed Projects

### Active Projects (11)

| Project | Domain | Branch |
|---|---|---|
| dev-admin-app-singlestarter | dev-admin-idhara.peepul.farm | dev |
| admin-app-singlestarter | admin-idhara.peepul.farm | main |
| dev-admin-app-sedyam-com | dev-admin-sedyam.peepul.farm | dev |
| dev-admin-app-iotsoftstarter-com | dev-iot.peepul.farm | dev |
| admin-app-iotsoftstarter-com | iot.peepul.farm | main |
| staging-admin-app-iotsoftstarter-com | staging-iot.peepul.farm | staging |
| dev-app-demetercloud-com | dev-dc.peepul.farm | dev |
| app.orc.com | orc.peepul.farm | dev |
| app-ats-com | ats.peepul.farm | main |
| apfc-app-dev | dev-apfc.vercel.app | dev |
| ros-bot-streaming | ros-bot-streaming.vercel.app | dev |
| idhara-com | idhara-com.vercel.app | master |
| peepulagri-com | peepulagri-com.vercel.app | dev |
| simulator-app | simulator-pa.vercel.app | main |

### Marketing / Landing Pages
| Project | Domain |
|---|---|
| farmlogs-peepulfarm | www.peepul.farm |
| dev-farmlogs-peepulfarm | dev.peepul.farm |
| staging-farmlogs-peepulfarm | staging.peepul.farm |

**Custom domain root:** All production apps use subdomains of `*.peepul.farm`.

---

## 3. Build Process

All projects follow the Vercel Git integration flow:

```
Developer pushes to GitHub
         ↓
Vercel webhook triggers automatically
         ↓
Install dependencies  →  npm install
         ↓
Build command runs
  Vite:    vite build
  Next.js: next build
  Astro:   astro build
         ↓
Output uploaded to Vercel Edge CDN (global)
         ↓
Deployment URL assigned → domain updated
```

### Branch → Environment Mapping

| Git Branch | Environment | Notes |
|---|---|---|
| `main` | Production | Live domain updated |
| `dev` | Preview | Used as production for dev-* projects |
| `staging` | Preview | Used as production for staging-* projects |
| `dev-sandbox` | Preview | Sandbox testing |

### Build Ignore Rule
Most projects skip builds for non-production branches:
```bash
[ "$VERCEL_GIT_COMMIT_REF" != "main" ]
```

---

## 4. Build & Deploy Times

| Project | Build Time |
|---|---|
| simulator-app | ~16 seconds |
| peepulagri-com | ~40 seconds |
| dev-admin-app-singlestarter | ~45 seconds |
| dev-admin-app-sedyam-com | ~57 seconds |
| Next.js projects | ~60–120 seconds |

- **Hobby plan:** 1 concurrent build at a time — builds queue if multiple trigger simultaneously
- **Deployment retention:** 30 days, minimum 10 deployments kept per project

---

## 5. CI/CD Pipeline

**No separate CI tool.** GitHub → Vercel direct integration handles everything.

```
GitHub (meghalu-peepulagri / peepulagri-bootstrap)
         ↓  push / merge
Vercel Build System
         ↓  build passes
Deployed to Edge CDN
         ↓
Custom domain points to new deployment
```

- GitHub orgs connected: `meghalu-peepulagri`, `peepulagri-bootstrap`
- Each project is linked to one repo + one branch
- No GitHub Actions, no Dockerfiles, no external runners
- Push to the tracked branch = automatic deploy, no manual steps

---

## 6. Bandwidth

| Item | Detail |
|---|---|
| Plan | Vercel Hobby |
| Included bandwidth | 100 GB / month |
| Overage | Not available on Hobby — site may be soft-blocked |
| Static assets | Served from Vercel Edge CDN globally (no origin cost) |

To check current usage:
[vercel.com/peepulagris-projects/settings/billing](https://vercel.com/peepulagris-projects/settings/billing)

---

## 7. External Services & Integrations

| Service | Projects | Purpose |
|---|---|---|
| **EMQX** | All admin apps, simulator-app | MQTT broker — real-time IoT device communication over WebSocket |
| **Supabase** | simulator-app | PostgreSQL database + authentication |
| **Firebase** | demetercloud | Push notifications |
| **Mapbox GL** | sedyam, iotsoftstarter | Interactive maps + geolocation |
| **Google Maps** | demetercloud | Maps |
| **GitHub** | All | Source control + Vercel CI/CD trigger |
| **Vercel Edge CDN** | All | Global static asset delivery |
| **Self-hosted Backend APIs** | All admin apps | REST APIs connected via `VITE_PUBLIC_API_URL`, `VITE_APFC_API_URL`, `VITE_AUTH_URL` etc. |

> Backend APIs are **not hosted on Vercel** — they run on self-hosted servers and are referenced via environment variables in each project.

---

## Summary

| Item | Detail |
|---|---|
| Total projects | 19 |
| Platform | Vercel Hobby |
| Frontend frameworks | Vite, Next.js, Astro |
| Language | TypeScript (all), HTML/CSS (peepulagri-com) |
| CI/CD | GitHub → Vercel (push to deploy) |
| Real-time | MQTT over WebSocket (EMQX) |
| Custom domain | *.peepul.farm |
| Backend | Self-hosted (not on Vercel) |
| Bandwidth | 100 GB/month |
| Concurrent builds | 1 (Hobby plan) |
