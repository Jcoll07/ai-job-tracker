# JobTrackr — AI Job Application Tracker (v2)

Track job applications with local-first automation:

- **Gmail monitoring** — read-only Gmail sync classifies hiring emails with the configured AI provider, links them to applications, and moves statuses forward automatically. Ambiguous emails land in a review inbox.
- **URL / paste capture** — add a job from a URL or pasted description; deterministic structured-data extraction is used before local AI parsing when needed.
- **CV management** — keep factual source CV versions, score fit, tailor CVs with local AI, and export the final document through the browser print dialog.
- **Full tracker** — search, filter, sort, bulk operations, status history, notes, per-job email timeline, JSON export/import and local SQLite storage.
- **Local-first AI** — oMLX/OpenAI-compatible local inference is the default. Cloud AI is optional and explicit.

> The previous single-file app lives in [`legacy/`](legacy/) and still works; export its backup and import it in Settings → Data.

## Repo layout

```
apps/web         Next.js app — tracker UI, API, Gmail sync, AI parsing (SQLite storage)
packages/core    Shared types, schemas, classification taxonomy
legacy/          The original v1 single-file app
docs/SETUP.md    Detailed setup (local AI, Gmail OAuth, validation)
scripts/         Local, macOS packaging and CI verification scripts
```

## Quick start

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # only if .env.local does not already exist
npm run dev                                     # http://localhost:3001
```

### One-command verification

The repository includes a complete local verifier. It installs dependencies, creates a missing `.env.local` without overwriting an existing one, typechecks, builds the web app, starts/reuses the local server, runs the API/security smoke tests and checks the configured local AI endpoint without printing its key.

```bash
npm run verify:local
```

This is the only local diagnostic command normally needed.

Works with no AI keys at all for manual tracking. Add the local oMLX key to unlock AI parsing/drafting and email classification.

| Feature | Needs |
|---|---|
| Manual tracking, search, filters, status history, notes, import/export | nothing |
| AI parsing (URL / paste / describe) | local oMLX/OpenAI-compatible endpoint + API key, or explicit Anthropic provider |
| Email monitoring + automatic status updates | AI provider + Google OAuth credentials |

## Gmail monitoring

See [docs/SETUP.md](docs/SETUP.md) for the Google OAuth configuration. The app uses the read-only Gmail scope. After OAuth is configured, click **Connect Gmail** in Settings. Sync can be triggered from the dashboard. For hosted deployments, `vercel.json` schedules `/api/gmail/sync` every 30 minutes; Vercel supplies the `CRON_SECRET` authorization header when that environment variable is configured.

## How email monitoring works

1. Gmail is queried (read-only scope) for mail from known ATS domains, from the email domains of companies you track, and for hiring-related subjects.
2. Each new email is classified by the configured AI provider into confirmation, assessment invite, interview invite, offer, rejection, recruiter outreach, or other.
3. Emails are matched to applications by sender domain, then company name.
4. High-confidence classifications that move an application forward are applied automatically and recorded in the job's status history. Everything else waits in **Email Inbox** for a one-click accept/dismiss.

## Privacy

- All data lives in a local SQLite file (`apps/web/data/jobtracker.db`) — or your own database if you deploy.
- Gmail access is read-only; tokens are stored in your database, never sent elsewhere by the app.
- Email/job content is sent only to the AI provider you explicitly configure. With `AI_PROVIDER=local`, content is sent to your local oMLX/OpenAI-compatible server.

## Deploying (optional)

The app runs locally without a cloud account. For scheduled Gmail sync while your Mac is off, deploy `apps/web` to Vercel (or another Node host):

1. Replace SQLite with a hosted database before relying on a multi-instance deployment (the data layer is isolated in `apps/web/src/lib/db.ts`).
2. Set env vars (`AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `CRON_SECRET`) and add the deployed callback URL to the Google OAuth client.
3. `vercel.json` schedules `/api/gmail/sync` every 30 minutes.

## License

MIT — see [LICENSE](LICENSE).
