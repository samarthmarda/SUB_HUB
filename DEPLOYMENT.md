# SUBSCRIPTION HUB — Setup & Deployment Guide

This document walks the owner (or a technical helper) through deploying SUBSCRIPTION HUB
as a **Google Apps Script Web App** backed by a **single private Google Spreadsheet**.

> **Honest scope note.** This repository contains the complete, production-ready source
> (React frontend + Apps Script backend) plus a passing test suite. Everything up to the
> final "push to Google + deploy" step has been built and verified here. The last steps —
> creating the Apps Script project, running the one-time setup that creates the Google
> Spreadsheet, and publishing the web app — **must be performed by you** because they
> require Google account authorisation that only you can grant. They take about 10 minutes
> and are spelled out below.

---

## Architecture at a glance

```
React (HTML5 / CSS3 / JSX)  +  SWR (cache, revalidation)
            │  google.script.run  (Promise wrapper, success/failure handlers)
            ▼
Google Apps Script V8  (HTMLService serves the built UI)
            │  SpreadsheetApp · PropertiesService · CacheService · LockService · ScriptApp
            ▼
One private Google Spreadsheet  (Customers, Subscriptions, Payments,
                                 SubscriptionPlans, ReminderLogs, Settings, AuditLog)
```

Google Sheets is the **only** business database. No external DB, no Node server, no paid CRM.

---

## Prerequisites

- A Google account (the spreadsheet + web app will be owned by it).
- [Node.js 18+](https://nodejs.org) installed locally.
- Google **clasp** (Command Line Apps Script): `npm install -g @google/clasp`
- clasp logged in: `clasp login` (opens a browser to authorise).

---

## Step 1 — Build the frontend bundle

From the project root:

```bash
npm install
npm run build
```

This compiles the React app and writes `apps-script/Index.html` — a single self-contained
HTML file with the JS + CSS inlined, ready for Apps Script's HTMLService. (`npm run deploy`
runs this automatically.)

---

## Step 2 — Create the Apps Script project

Create a **standalone** Apps Script project and link this repo to it:

```bash
# Create a new project bound to a Google account (creates it in Drive)
clasp create --type webapp --title "SUBSCRIPTION HUB" --rootDir ./apps-script
```

`clasp create` writes the real `scriptId` into `.clasp.json`. Alternatively, create the
project at https://script.google.com and paste its ID into `.clasp.json`:

```json
{ "rootDir": "apps-script", "scriptId": "PASTE_YOUR_SCRIPT_ID" }
```

---

## Step 3 — Push the code

```bash
npm run build      # ensure Index.html is fresh
clasp push
```

This uploads every `.gs` module plus `Index.html` and `appsscript.json`.

---

## Step 4 — Run the one-time setup (creates the Google Spreadsheet)

In the Apps Script editor (https://script.google.com), select the function **`bootstrap`**
from the toolbar dropdown and click **Run**. Authorise the requested scopes when prompted.

`bootstrap()` will:

1. Create a new private spreadsheet named **`SUBSCRIPTION HUB - DATABASE`** (or reconnect to
   an existing one if already configured — it is idempotent and never duplicates or deletes data).
2. Create all seven tabs with headers, frozen header rows, filters, date/currency formats and
   dropdown validation.
3. Seed default settings (INR / ₹ / +91 / Asia/Kolkata / 500 capacity) and default plans
   (Monthly, Quarterly, Half-yearly, Yearly, Custom).
4. Seed the administrator: login **`RAMESH`**, temporary password **`JSK`** (hashed; plaintext
   never stored).
5. Install the daily reminder trigger (~09:00 Asia/Kolkata).

It returns the **spreadsheet URL** — copy it somewhere safe (it is also visible in Settings).

> You can re-run `bootstrap()` any time safely.

---

## Step 5 — Deploy the web app (owner-only)

```bash
clasp deploy --description "SUBSCRIPTION HUB v1"
```

Or in the editor: **Deploy → New deployment → Web app**, with:

- **Execute as:** *Me* (the deploying owner)
- **Who has access:** *Only myself*

`appsscript.json` already sets `executeAs: USER_DEPLOYING` and `access: MYSELF`. Copy the
`/exec` URL — that is your private app.

> Do **not** enable "Anyone" / anonymous access. The admin login is an additional gate on top
> of Google's owner-only restriction.

---

## Step 6 — First login

1. Open the `/exec` URL.
2. Log in with **RAMESH / JSK**.
3. You will be **forced to choose a new password** before reaching the dashboard. Do so.
4. You land on the dashboard. Start adding customers with **New Customer**.

---

## Daily operation

- **Reminders** are generated automatically each morning (7, 3 and 0 days before expiry, plus
  an overdue nudge). The app never sends WhatsApp for you — click **WhatsApp** to open the
  pre-filled chat, send it yourself, then mark it sent.
- **Backups:** a weekly automatic backup runs Sunday ~02:00 and keeps the most recent 8. You
  can also create one instantly from **Settings → Backup**.
- **Session:** lasts 12 hours of inactivity; logout clears all cached data.

---

## Security checklist

- [x] Passwords stored as salted PBKDF2-style SHA-256 hashes in Script Properties (never plaintext).
- [x] Random session tokens, validated + expiry-checked server-side on every API call.
- [x] Spreadsheet kept private; web app deployed owner-only; admin login as a second gate.
- [x] No spreadsheet IDs, secrets or PII exposed to the frontend; errors never leak stack traces.
- [x] Payments/audit are append-only; archive instead of delete.

---

## Project structure

```
apps-script/            ← everything clasp pushes (rootDir)
  Code.gs               doGet() (serves Index.html), bootstrap()
  Auth.gs               login, sessions, password hashing
  Database.gs           batched reads/writes, locking, error shaping
  Schema.gs             tab layout + idempotent setupSubscriptionHub()
  CustomerService.gs    directory, capacity, atomic create, 360 profile
  SubscriptionService.gs create/renew/approve/cancel + status engine
  PaymentService.gs     append-only payments/refunds + balances
  RenewalService.gs     renewal queues
  CalendarService.gs    renewal calendar
  ReminderService.gs    idempotent reminder generation + queue
  WhatsAppService.gs    wa.me Click-to-Chat + templates
  DashboardService.gs   KPIs / analytics / action queue (cached)
  ReportsService.gs     reports + CSV export
  SettingsService.gs    settings + plans
  AuditService.gs       audit trail
  Triggers.gs           scheduled reminders + backups
  Validators.gs         server-side validation
  Utils.gs              pure date/phone/money helpers
  Api.gs                the documented api* surface (session-guarded)
  appsscript.json       V8 runtime, timezone, scopes, webapp access
  index.template.html   HTMLService template (bundle injected at build)
  Index.html            GENERATED by `npm run build` (git-ignored)

src/                    ← React + SWR frontend source
  api.js                google.script.run Promise wrapper + typed API
  swr.js                SWR hooks, cache invalidation, sync-time
  components/           Layout, modals, charts, UI primitives, WhatsApp
  pages/                Login, Dashboard, Customers, Profile, Subscriptions,
                        Plans, Renewals, Calendar, Reminders, Payments,
                        Reports, Settings
tests/                  Node unit tests (real backend logic) + mock smoke test
```

---

## Testing

```bash
npm test           # 28 unit tests over the real Apps Script date/phone/money/
                   # validation/subscription/password logic (via a vm + mocked Utilities)
node tests/mock-smoke.mjs   # exercises every API contract through the dev mock
```

---

## Server API (all session-guarded except `apiLogin`)

`apiLogin · apiLogout · apiGetSession · apiChangePassword · apiChangeLoginId ·
apiGetDashboard · apiListCustomers · apiGetCustomerProfile · apiCreateCustomer ·
apiUpdateCustomer · apiArchiveCustomer · apiCheckDuplicatePhone · apiGetCapacity ·
apiListSubscriptions · apiCreateSubscription · apiRenewSubscription ·
apiApproveSubscription · apiCancelSubscription · apiRecordPayment · apiListPayments ·
apiGetRenewals · apiGetCalendarEvents · apiGetReminderQueue · apiMarkReminderSent ·
apiLogReminderClick · apiSaveFollowUp · apiEnsureReminders · apiComposeReminderWhatsApp ·
apiComposeCustomerWhatsApp · apiGetWhatsAppTemplates · apiSearch · apiGetReports ·
apiExportCsv · apiGetSettings · apiUpdateSettings · apiListPlans · apiCreatePlan ·
apiUpdatePlan · apiDeactivatePlan · apiGetAudit · apiCreateBackup · apiGetTriggerStatus ·
apiInstallReminderTrigger`

All responses are `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
Dates cross the boundary as `YYYY-MM-DD` strings.
