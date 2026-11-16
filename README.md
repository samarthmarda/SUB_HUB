# SUBSCRIPTION HUB

A premium subscription-management web app for a WhatsApp stock-market advisory group.
Built on **Google Sheets + Google Apps Script** with a **React + SWR** frontend, it replaces
the manual register: log in and instantly see active members, collections, outstanding
balances, and exactly whose subscription expires today / in 3 days / in 7 days — then send a
one-click personalised WhatsApp reminder.

## What it does

- **Dashboard** — 6 KPI cards, renewal forecast, revenue trend, payment mix, quick actions,
  action queue and recent activity (all computed from real records).
- **Customers** — searchable / filterable / sortable directory with a 4-section New Customer
  modal (personal → subscription → payment → activation), 500-member capacity guard and
  duplicate-phone detection.
- **Customer 360** — overview, subscription history, payments, renewal history, reminders and
  activity log, with WhatsApp / Edit / Renew / Record-payment / Approve.
- **Subscription engine** — every renewal creates a new linked record (early renewals start
  the day after the previous expiry); manual expiry override; independent payment vs
  activation status; partial-payment approval.
- **Payments** — append-only payments & refunds with net-paid / outstanding / credit math.
- **Renewals & Calendar** — always-current queues plus month/week/day calendar with an event
  drawer.
- **WhatsApp reminders** — auto-generated (7/3/0-day + overdue), deduplicated, Click-to-Chat
  only (you send manually), with follow-up tracking.
- **Reports** — revenue / subscription / outstanding reports with CSV export.
- **Settings** — business info, plans, WhatsApp templates, reminder schedule & trigger,
  change password / login ID, manual + scheduled backups.
- **Security** — salted password hashing, server-side sessions with expiry, owner-only
  deployment, private spreadsheet, append-only audit trail.

## Tech stack

React · SWR · Vite (dev/bundler only) · Google Apps Script V8 · SpreadsheetApp ·
PropertiesService · CacheService · LockService · ScriptApp. Google Sheets is the only database.

## Quick start (development preview)

```bash
npm install
npm run dev      # opens the UI with an in-memory mock backend (no Google needed)
```

## Deploy to Google

See **[DEPLOYMENT.md](./DEPLOYMENT.md)**. In short: `npm run build` → `clasp create` →
`clasp push` → run `bootstrap()` once in the editor (creates the spreadsheet) → `clasp deploy`
as an owner-only web app → log in with `RAMESH` / `JSK` and set a new password.

## Test

```bash
npm test                          # unit tests over the real backend logic
node tests/mock-smoke.mjs         # API-contract smoke test through the dev mock
```

## Repository layout

- `apps-script/` — Google Apps Script backend (this is what gets pushed).
- `src/` — React + SWR frontend.
- `tests/` — Node tests.
- `scripts/build-gas.mjs` — inlines the built bundle into the HTMLService template.

> The final Google Spreadsheet and the deployed `/exec` URL are produced when **you** run the
> setup + deploy steps in DEPLOYMENT.md (they require your Google authorisation).
