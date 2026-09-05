# Setup Guide

## 1. Install & run

```bash
git clone https://github.com/Jcoll07/ai-job-tracker.git
cd ai-job-tracker
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev        # http://localhost:3001
```

Manual job tracking works immediately. AI, Gmail, CV tailoring and extension capture are enabled by the steps below.

For a complete local diagnostic, use the single command `npm run verify:local`.

## 2. Local AI (default)

The app defaults to an OpenAI-compatible local endpoint:

```env
AI_PROVIDER=local
AI_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=Qwen2.5.1-Coder-7B-Instruct-4bit
```

Point these variables at your local MLX/oMLX server. The server must expose `POST /v1/chat/completions`. No job posting or email body is sent to Anthropic when `AI_PROVIDER=local`.

For an explicit cloud fallback only:

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-haiku-4-5
```

Restart the web app after changing environment variables.

## 3. Gmail monitoring (read-only)

1. In Google Cloud Console, create/select a project and enable the **Gmail API**.
2. Configure the OAuth consent screen and add your Google account as a test user if the app is external.
3. Create an OAuth **Web application** client.
4. Authorized redirect URI: `http://localhost:3001/api/gmail/callback`.
5. Put the client ID/secret in `apps/web/.env.local`:

```env
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=....
APP_URL=http://localhost:3001
```

6. Restart the app and use **Settings → Connect Gmail**.
7. Run **Sync Gmail** from the dashboard.

The tracker uses the `gmail.readonly` scope. It does not send, modify or delete mail.

For hosted deployments, configure `CRON_SECRET`. The repository's `vercel.json` schedules `/api/gmail/sync` every 30 minutes, and Vercel supplies the cron authorization header.

## 4. Safari extension

The extension uses WXT's cross-browser API and the same source code can target Safari and Chromium-based browsers.

To build and package Safari on macOS:

```bash
npm run package:safari
```

This builds the Safari target and runs Apple's Safari Web Extension Packager, generating a macOS Xcode project under `apps/extension/safari/`. Apple documents that the packager creates the containing app and Xcode project, with `--copy-resources` copying the extension resources into the generated project. citeturn0search0turn0search1

Open the generated Xcode project, build/run the macOS containing app, and enable JobTrackr under Safari → Settings → Extensions. For unsigned development extensions, Safari may require allowing unsigned extensions. citeturn0search10

In the extension popup, set the server URL to `http://localhost:3001` and paste the token shown under **Settings → Browser Extension**.

## 5. Capture and autofill

- On LinkedIn, Indeed, Greenhouse, Lever, Workday or another job page: open the extension and choose **Save this job to tracker**.
- On an application form: complete **Profile**, select a CV version in **CV Manager**, then use **Autofill application form**.
- The extension fills fields but never submits the application for you.
- Resume attachment is best-effort because some ATS upload widgets intentionally reject programmatic file assignment.

## 6. CV Manager

Open **CV Manager** from the top navigation.

1. Create a factual source CV for each target family (Product Engineer, Process Engineer, Industrialisation Engineer, R&D / Solution Architect, Automation Engineer, General Engineering).
2. Paste the source CV text into the version.
3. Optionally attach a PDF/DOC/DOCX file to that version.
4. On a tracked job, open its detail page. The **Fit Score** explains experience, technical, industry, education, location and seniority components and lists strengths/gaps.
5. Assign the CV version used for the application.
6. Use **AI tailor → new CV version**. The source version is never overwritten.
7. Review the generated CV and use **Print / Save PDF** to produce the final PDF from Safari's print dialog.

The tailoring prompt is constrained to facts present in the source CV/profile and is not allowed to invent employers, dates, technologies, metrics or responsibilities.

## 7. Backup

**Settings → Data** exports jobs and CV source versions to JSON. Import accepts the old v1 job-only backup format and the new backup format; duplicates are skipped.

Local runtime data is stored under `apps/web/data/` and is not committed to Git.

## 8. Validation

From the repository root:

```bash
npm run verify:local
```

This runs dependency installation, typechecking, production builds, Chrome/Safari extension builds, authenticated API E2E tests and a local AI connectivity check.

The repository CI workflow runs the build and E2E validation automatically on pushes to `main`/feature branches and pull requests to `main`.

## Troubleshooting

- **Local AI unavailable:** verify the endpoint responds at `AI_BASE_URL/v1/chat/completions`, then confirm `AI_MODEL` matches the model served by your local runtime.
- **Gmail `redirect_uri_mismatch`:** the Google Cloud redirect URI must exactly match `http://localhost:3001/api/gmail/callback` for the local setup.
- **Extension red dot:** confirm the web app is running on port 3001 and that the extension token matches Settings.
- **Safari extension not visible:** run `npm run package:safari`, build/run the generated containing app in Xcode, then enable the extension in Safari Settings → Extensions. For unsigned development builds, allow unsigned extensions if Safari requires it. citeturn0search10
- **LinkedIn capture is incomplete:** use the extension while the job page is open; server-side URL fetching can be blocked by some sites.
