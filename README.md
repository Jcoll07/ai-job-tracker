# JobTrackr — AI Job Application Tracker (v2)

Track every job application with near-zero manual effort:

- **One-click capture** — the browser extension detects job postings (LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday…) and saves them to your tracker with structured fields.
- **Autofill applications** — the extension fills application forms from your saved profile (name, links, work authorization, salary, stock answers). You review and hit Submit.
- **Capture from your phone** — the app is an installable PWA: on Android, share any job link straight into the tracker; on iPhone, a Shortcut does the same. The default server binds to `127.0.0.1`; do not expose it to a LAN/Tailscale/public network without adding an authenticated reverse proxy.
- **Self-updating statuses** — Gmail monitoring pulls hiring-team emails, classifies them with the configured AI provider (local oMLX by default; Claude is optional), links them to the right application, and moves the status forward automatically. Ambiguous emails land in a review inbox.
- **Batch-apply with Claude in Chrome** — a `/apply` skill for Claude Code can drive your real browser through the saved-jobs pile: fills each form from your profile, waits for you to review and submit, then updates the tracker.
- **Full tracker** — search, filter, sort, bulk operations, status history, notes, per-job email timeline, JSON export/import (your v1 backup imports directly into v2).

> The previous single-file app lives in [`legacy/`](legacy/) and still works; export its backup and import it in Settings → Data.

## Repo layout

```
apps/web         Next.js app — tracker UI, API, Gmail sync, AI parsing (SQLite storage)
apps/extension   Browser extension (WXT) — capture + autofill
packages/core    Shared types, schemas, classification taxonomy
legacy/          The original v1 single-file app
docs/SETUP.md    Detailed setup (API keys, Gmail OAuth, extension install)
scripts/         Local, Safari packaging and CI verification scripts
```

## Quick start

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # only if .env.local does not already exist
npm run dev                                     # http://localhost:3001
```

### One-command verification

The repository includes a complete local verifier. It installs dependencies, creates a missing `.env.local` without overwriting an existing one, typechecks, builds the web app and both extension targets, starts/reuses the local server, runs the authenticated E2E smoke test, and checks the configured local AI endpoint without printing its key.

```bash
npm run verify:local
```

This is the only local diagnostic command normally needed.

Works with no AI keys at all for manual tracking. Add the local oMLX key to unlock AI parsing/drafting and email classification:

| Feature | Needs |
|---|---|
| Manual tracking, search, filters, status history, notes, import/export | nothing |
| AI parsing (URL / paste / describe / extension capture on unstructured pages) | local oMLX/OpenAI-compatible endpoint + API key, or explicit Anthropic provider |
| Email monitoring + automatic status updates | AI provider + Google OAuth credentials |
| Extension capture on pages with structured data | nothing beyond the local server |

## Browser extension

The extension supports the browser targets built by WXT. For Chrome:

```bash
npm run build:extension
```

Then `chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension/.output/chrome-mv3`. Open the popup → Settings and paste the Server URL + token shown in the web app under **Settings → Browser Extension**.

For Safari on macOS:

```bash
npm run package:safari
```

This builds the Safari target and invokes Apple's Safari Web Extension Packager to generate a macOS Xcode project under `apps/extension/safari/`. Open the generated project in Xcode, build/run the macOS containing app, then enable JobTrackr under Safari → Settings → Extensions. The packaging command is macOS-only and requires Xcode command-line tools.

## Gmail monitoring

See [docs/SETUP.md](docs/SETUP.md) for the Google OAuth configuration. The app uses the read-only Gmail scope. After OAuth is configured, click **Connect Gmail** in Settings. Sync can be triggered from the dashboard. For hosted deployments, `vercel.json` schedules `/api/gmail/sync` every 30 minutes; Vercel supplies the `CRON_SECRET` authorization header when that environment variable is configured.

## How email monitoring works

1. Gmail is queried (read-only scope) for mail from known ATS domains (greenhouse.io, lever.co, ashbyhq.com, workday, …), from the email domains of companies you track, and for hiring-related subjects.
2. Each new email is classified by the configured AI provider into: confirmation, assessment invite, interview invite, offer, rejection, recruiter outreach, or other.
3. Emails are matched to applications by sender domain, then company name.
4. High-confidence classifications that move an application **forward** (Applied → Interview → Offer / Rejected) are applied automatically and recorded in the job's status history. Everything else waits in **Email Inbox** for a one-click accept/dismiss.

## Privacy

- All data lives in a local SQLite file (`apps/web/data/jobtracker.db`) — or your own database if you deploy.
- Gmail access is read-only; tokens are stored in your database, never sent elsewhere by the app.
- Email/job content is sent only to the AI provider you explicitly configure. With `AI_PROVIDER=local`, content is sent to your local oMLX/OpenAI-compatible server.
- The extension talks only to *your* server, authenticated with a token you control.

## Deploying (optional)

The app runs locally without a cloud account. For scheduled Gmail sync while your Mac is off, deploy `apps/web` to Vercel (or another Node host):

1. Replace SQLite with a hosted database before relying on a multi-instance deployment (the data layer is isolated in `apps/web/src/lib/db.ts`).
2. Set env vars (`AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `CRON_SECRET`) and add the deployed callback URL to the Google OAuth client.
3. `vercel.json` schedules `/api/gmail/sync` every 30 minutes.

## What the extension does — and doesn't

Capture and autofill are assistive: the extension never submits an application for you. Fully automated submission violates job-board terms of service and breaks constantly; review-and-submit keeps your accounts safe while removing most of the typing.

## License

MIT — see [LICENSE](LICENSE).
