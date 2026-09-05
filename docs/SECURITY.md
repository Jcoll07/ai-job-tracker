# Security model

JobTrackr is designed as a local-first application. The web server is bound to `127.0.0.1` by the development and production start scripts, and the SQLite database lives under the ignored `apps/web/data/` directory by default.

## Protected areas

- Gmail OAuth uses a cryptographically random, single-use state value with a 10-minute lifetime and constant-time comparison.
- Gmail manual sync/disconnect and settings mutations are restricted to local requests; scheduled sync requires `CRON_SECRET`.
- Extension API calls require a locally generated bearer token. Token comparison is constant-time.
- API responses are marked `no-store`; baseline browser security headers are enabled.
- Job-posting URL analysis blocks non-HTTP(S) schemes, credentials, non-standard ports, localhost/private/link-local addresses, private DNS results, unsafe redirects and responses larger than 2 MB.
- Backup export intentionally excludes Gmail OAuth tokens, extension tokens and API keys.
- Backup import has a 5 MB limit and validates the profile, CV size and supported CV families.

## Data handling

The local SQLite database may contain application history, job descriptions, email metadata/snippets and profile/CV information. Keep the database and exported backups private. `.env.local` and `apps/web/data/` are ignored by Git.

The repository should not contain real contact details or API credentials. Personal profile data belongs in the local database/profile UI, not source code.

## Known boundary

If the application is deliberately deployed behind a public reverse proxy, the local-only security assumptions no longer apply to all endpoints. A hosted deployment requires an explicit authentication layer and should not reuse the local configuration unchanged.
