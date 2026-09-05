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

## 2. Local AI (default)

The app defaults to an OpenAI-compatible local endpoint:

```env
AI_PROVIDER=local
AI_BASE_URL=http://127.0.0.1:8080/v1
AI_MODEL=qwen3-8b
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
7. Run **Sync Gmail** from the dashboard or let the local launchd/cron scheduler call the sync endpoint.

The tracker uses the `gmail.readonly` scope. It does not send, modify or delete mail. Google documents `gmail.readonly` as the scope for viewing Gmail messages/settings. citeturn0search0

## 4. Safari extension

The extension uses WXT's cross-browser API and the same source code can target Safari, Chrome, Firefox and Edge. WXT provides a unified `browser` API across these browsers. citeturn0search1turn0search4

Build:

```bash
npm run build:safari --workspace=apps/extension
```

For Safari packaging on macOS:

```bash
cd apps/extension
xcrun safari-web-extension-packager .output/safari-mv2
```

Open the generated Xcode project, build/run the macOS Safari Web Extension target, and enable it under Safari Settings → Extensions. WXT exposes a browser-specific build flag (`-b safari`). citeturn0search5

In the extension popup, set the server URL to `http://localhost:3001` and paste the token shown under **Settings → Safari Extension**.

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

The tailoring prompt is explicitly constrained to facts present in the source CV/profile and is not allowed to invent employers, dates, technologies, metrics or responsibilities.

## 7. Automatic Gmail sync on macOS

The repository includes a local launchd setup. It can trigger Gmail sync according to the interval configured in **Settings** while the web app is running. No cloud scheduler is required.

For a simple cron setup, add a random `CRON_SECRET` to `.env.local` and call:

```bash
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3001/api/gmail/sync
```

The local scheduler should remain bound to localhost unless you intentionally add authenticated remote access.

## 8. Backup

**Settings → Data** exports jobs and CV source versions to JSON. Import accepts the old v1 job-only backup format and the new backup format; duplicates are skipped.

Local runtime data is stored under `apps/web/data/` and is not committed to Git.

## 9. Validation

From the repository root:

```bash
npm run typecheck
npm run build
npm run build:extension
npm run build:safari
```

The repository CI workflow runs these checks automatically on pushes to the feature branch and pull requests to `main`.

## Troubleshooting

- **Local AI unavailable:** verify the endpoint responds at `AI_BASE_URL/v1/chat/completions`, then confirm `AI_MODEL` matches the model served by your local runtime.
- **Gmail `redirect_uri_mismatch`:** the Google Cloud redirect URI must exactly match `http://localhost:3001/api/gmail/callback` for the local setup.
- **Extension red dot:** confirm the web app is running on port 3001 and that the extension token matches Settings.
- **Safari extension not visible:** rebuild with `-b safari`, package through Xcode, run the Safari Web Extension target, then enable it in Safari Settings → Extensions.
- **LinkedIn capture is incomplete:** use the extension while the job page is open; server-side URL fetching can be blocked by some sites.
