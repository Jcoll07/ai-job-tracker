#!/bin/sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EXT_DIR="$ROOT_DIR/apps/extension"; OUTPUT_DIR="$EXT_DIR/.output/safari-mv2"; PROJECT_DIR="$EXT_DIR/safari"; INSTALL_DIR="${HOME}/Applications"; CONTAINER_APP="$INSTALL_DIR/JobTrackr Safari Extension.app"; DERIVED_DIR="$EXT_DIR/.output/safari-derived"
if [ "$(uname -s)" != "Darwin" ]; then printf '%s\n' "Safari packaging is only available on macOS." >&2; exit 1; fi
command -v xcrun >/dev/null 2>&1 || { printf '%s\n' "Xcode command-line tools are required (xcrun not found)." >&2; exit 1; }; command -v xcodebuild >/dev/null 2>&1 || { printf '%s\n' "Xcode is required (xcodebuild not found)." >&2; exit 1; }; command -v plutil >/dev/null 2>&1 || { printf '%s\n' "macOS plutil is required." >&2; exit 1; }; command -v codesign >/dev/null 2>&1 || { printf '%s\n' "macOS codesign is required." >&2; exit 1; }
cd "$ROOT_DIR"; npm run build:safari --workspace=apps/extension; [ -d "$OUTPUT_DIR" ] || { printf '%s\n' "Safari build output not found: $OUTPUT_DIR" >&2; exit 1; }; rm -rf "$PROJECT_DIR"; mkdir -p "$PROJECT_DIR"
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then PACKAGER="safari-web-extension-packager"; elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then PACKAGER="safari-web-extension-converter"; else printf '%s\n' "Safari web-extension packager/converter is unavailable in the selected Xcode toolchain." >&2; exit 1; fi
xcrun "$PACKAGER" "$OUTPUT_DIR" --project-location "$PROJECT_DIR" --app-name "JobTrackr Safari Extension" --bundle-identifier "com.jcoll07.jobtrackr.safariextension" --macos-only --copy-resources --no-open --no-prompt --force
PROJECT=$(find "$PROJECT_DIR" -type d -name '*.xcodeproj' -print -quit); [ -n "$PROJECT" ] || { printf '%s\n' "Safari Xcode project was not generated." >&2; exit 1; }; xcodebuild -list -project "$PROJECT" >/dev/null
SCHEME=$(xcodebuild -list -json -project "$PROJECT" | plutil -extract project.schemes.0 raw -o - - 2>/dev/null || true); [ -n "$SCHEME" ] || { printf '%s\n' "No Xcode scheme was found for the generated Safari project." >&2; exit 1; }
rm -rf "$DERIVED_DIR"; BUILD_STATUS=0; xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Debug -derivedDataPath "$DERIVED_DIR" CODE_SIGN_IDENTITY="-" DEVELOPMENT_TEAM="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO build >/dev/null 2>&1 || BUILD_STATUS=$?
CONTAINER_SOURCE=""; for app in "$DERIVED_DIR"/Build/Products/Debug/*.app; do [ -d "$app" ] || continue; if find "$app/Contents/PlugIns" -maxdepth 2 -name '*.appex' -print -quit 2>/dev/null | grep -q .; then CONTAINER_SOURCE="$app"; break; fi; done
[ -n "$CONTAINER_SOURCE" ] || { printf '%s\n' "Xcode did not produce a containing app with an embedded Safari .appex (build status $BUILD_STATUS)." >&2; exit 1; }; if [ "$BUILD_STATUS" -ne 0 ]; then printf '%s\n' "Xcode reported status $BUILD_STATUS after producing the complete local bundle; applying the local development signature."; fi
SIGN_IDENTITY="-"; if command -v security >/dev/null 2>&1; then DEV_ID=$(security find-identity -v -p codesigning 2>/dev/null | sed -n 's/.*"\(Apple Development: .*\)"/\1/p' | head -n 1 || true); [ -n "$DEV_ID" ] && SIGN_IDENTITY="$DEV_ID"; fi
codesign --force --deep --sign "$SIGN_IDENTITY" "$CONTAINER_SOURCE" >/dev/null; codesign --verify --deep --strict "$CONTAINER_SOURCE" >/dev/null 2>&1 || { printf '%s\n' "Generated Safari app failed code-signature verification." >&2; exit 1; }
if [ "${CI:-}" != "true" ]; then
  mkdir -p "$INSTALL_DIR"; rm -rf "$CONTAINER_APP"; ditto "$CONTAINER_SOURCE" "$CONTAINER_APP"; APPEX=$(find "$CONTAINER_APP/Contents/PlugIns" -maxdepth 2 -name '*.appex' -print -quit 2>/dev/null || true); [ -n "$APPEX" ] || { printf '%s\n' "Installed Safari app has no embedded extension." >&2; exit 1; }
  if [ "$SIGN_IDENTITY" != "-" ]; then codesign --force --deep --sign "$SIGN_IDENTITY" "$CONTAINER_APP" >/dev/null; else codesign --force --deep --sign - "$CONTAINER_APP" >/dev/null; fi
  codesign --verify --deep --strict "$CONTAINER_APP" >/dev/null 2>&1 || { printf '%s\n' "Installed Safari app failed code-signature verification." >&2; exit 1; }
  EXT_BUNDLE_ID=$(plutil -extract CFBundleIdentifier raw -o - "$APPEX/Contents/Info.plist" 2>/dev/null || true); [ -n "$EXT_BUNDLE_ID" ] || { printf '%s\n' "Could not read the embedded Safari extension bundle identifier." >&2; exit 1; }
  open "$CONTAINER_APP"
  if command -v pluginkit >/dev/null 2>&1; then
    pluginkit -a "$APPEX" >/dev/null 2>&1 || true
    REGISTERED=0; for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do if pluginkit -mAvvv -p com.apple.Safari.web-extension 2>/dev/null | grep -Fq "$EXT_BUNDLE_ID"; then REGISTERED=1; break; fi; sleep 1; done
    if [ "$REGISTERED" -ne 1 ]; then
      printf '%s\n' "WARNING: Safari has not registered the extension yet. Safari requires an opened containing app and, for unsigned development builds, Allow Unsigned Extensions. The web app is still installed." >&2
    fi
  fi
  printf '\nJobTrackr Safari extension built and installed.\nApp: %s\nExtension: %s\n' "$CONTAINER_APP" "$EXT_BUNDLE_ID"
else printf '\nSafari Xcode project and containing app validated in CI:\n%s\n' "$CONTAINER_SOURCE"; fi
