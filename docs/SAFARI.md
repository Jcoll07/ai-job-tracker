# Safari support

The extension uses WXT's cross-browser `browser` API and has a Safari build target. WXT supports Safari from the same extension source; Safari packaging is the platform-specific part.

## Build

From the repository root:

```bash
npm install
npm run build:extension --workspace=apps/extension
npm run build:safari --workspace=apps/extension
```

The Safari build is emitted under `apps/extension/.output/`.

## Package for Safari / Xcode

Safari web extensions are wrapped in a native macOS/iOS Safari Web Extension project. On macOS, the generated extension can be packaged with Apple's `safari-web-extension-packager` tooling and opened in Xcode. The exact Xcode project steps depend on the installed Xcode version.

Typical WXT packaging flow:

```bash
cd apps/extension
xcrun safari-web-extension-packager .output/safari-mv2
```

Then open the generated Xcode project, select the macOS Safari Web Extension target, build/run it, and enable the extension in Safari Settings → Extensions.

## Permissions

The extension currently requests `activeTab`, `storage`, `tabs` and `<all_urls>`. This is required for capture/autofill across job boards. Keep the extension local and do not expose the tracker server outside the Mac unless authentication and CORS are explicitly hardened.

## Functional test checklist

1. Run the web app on `http://localhost:3001`.
2. Configure the extension server URL and extension token.
3. Open a normal job page in Safari.
4. Capture the job and confirm it appears in the dashboard.
5. Open the job detail and assign a CV version.
6. Open an application form and run Autofill.
7. Confirm that fields are populated and that the extension never submits the form.
8. Connect Gmail in Settings and run a manual sync.
9. Confirm hiring emails appear in Inbox and linked job status changes only for high-confidence forward transitions.
10. Run CV tailoring locally and review the generated version before printing/saving it as PDF.
