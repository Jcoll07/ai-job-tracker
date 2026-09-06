#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EXT_DIR="$ROOT_DIR/apps/extension"
OUTPUT_DIR="$EXT_DIR/.output/safari-mv2"
PROJECT_DIR="$EXT_DIR/safari"
INSTALL_DIR="${HOME}/Applications"
CONTAINER_APP="$INSTALL_DIR/JobTrackr Safari Extension.app"
DERIVED_DIR="$EXT_DIR/.output/safari-derived"

if [ "$(uname -s)" != "Darwin" ]; then
  printf '%s\n' "Safari packaging is only available on macOS." >&2
  exit 1
fi
command -v xcrun >/dev/null 2>&1 || { printf '%s\n' "Xcode command-line tools are required (xcrun not found)." >&2; exit 1; }
[ -x "$(command -v xcodebuild 2>/dev/null || true)" ] || { printf '%s\n' "Xcode is required (xcodebuild not found). Install/open Xcode once and accept its license." >&2; exit 1; }
command -v plutil >/dev/null 2>&1 || { printf '%s\n' "macOS plutil is required." >&2; exit 1; }
command -v codesign >/dev/null 2>&1 || { printf '%s\n' "macOS codesign is required." >&2; exit 1; }
cd "$ROOT_DIR"
npm run build:safari --workspace=apps/extension
[ -d "$OUTPUT_DIR" ] || { printf '%s\n' "Safari build output not found: $OUTPUT_DIR" >&2; exit 1; }
rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"

# Apple renamed the command-line tool from safari-web-extension-converter to
# safari-web-extension-packager. Prefer the current name but retain the older
# name because it is still shipped by some Xcode versions.
if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  PACKAGER="safari-web-extension-packager"
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  PACKAGER="safari-web-extension-converter"
else
  printf '%s\n' "Neither safari-web-extension-packager nor safari-web-extension-converter is available in the selected Xcode toolchain." >&2
  exit 1
fi

# Keep the containing-app name and bundle identifier stable so rebuilding the
# project updates the existing Safari extension instead of registering a new
# extension identity on every update.
xcrun "$PACKAGER" "$OUTPUT_DIR" \
  --project-location "$PROJECT_DIR" \
  --app-name "JobTrackr Safari Extension" \
  --bundle-identifier "com.jcoll07.jobtrackr.safariextension" \
  --macos-only \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force

# Xcode's packager can place the generated project one level below the
# requested location on some Xcode releases. Search recursively rather than
# assuming a fixed output depth.
PROJECT=$(find "$PROJECT_DIR" -type d -name '*.xcodeproj' -print -quit)
[ -n "$PROJECT" ] || {
  printf '%s\n' "Safari Xcode project was not generated. Contents of output directory:" >&2
  find "$PROJECT_DIR" -maxdepth 4 -print >&2
  exit 1
}
xcodebuild -list -project "$PROJECT" >/dev/null

# Build the containing app. New Xcode releases can reject the generated local
# project during ValidateEmbeddedBinary because the generated targets start
# unsigned. The build has nevertheless produced the complete .app/.appex by
# that point. We repair that local-development bundle with an ad-hoc signature
# below, then verify it recursively before installing it.
SCHEME=$(xcodebuild -list -json -project "$PROJECT" | plutil -extract project.schemes.0 raw -o - - 2>/dev/null || true)
[ -n "$SCHEME" ] || { printf '%s\n' "No Xcode scheme was found for the generated Safari project." >&2; exit 1; }
rm -rf "$DERIVED_DIR"
BUILD_STATUS=0
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Debug \
  -derivedDataPath "$DERIVED_DIR" \
  CODE_SIGN_IDENTITY="-" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  build >/dev/null 2>&1 || BUILD_STATUS=$?

CONTAINER_SOURCE=""
for app in "$DERIVED_DIR"/Build/Products/Debug/*.app; do
  [ -d "$app" ] || continue
  if find "$app/Contents/PlugIns" -maxdepth 2 -name '*.appex' -print -quit 2>/dev/null | grep -q .; then
    CONTAINER_SOURCE="$app"
    break
  fi
done
[ -n "$CONTAINER_SOURCE" ] || {
  printf '%s\n' "Xcode did not produce a containing app with an embedded Safari .appex (build status $BUILD_STATUS)." >&2
  exit 1
}

if [ "$BUILD_STATUS" -ne 0 ]; then
  printf '%s\n' "Xcode reported ValidateEmbeddedBinary status $BUILD_STATUS; repairing the generated local-development bundle with an ad-hoc signature."
fi
codesign --force --deep --sign - "$CONTAINER_SOURCE" >/dev/null
codesign --verify --deep --strict "$CONTAINER_SOURCE" >/dev/null 2>&1 || {
  printf '%s\n' "The generated Safari containing app failed recursive code-signature verification." >&2
  exit 1
}

# CI validates the generated project, embedded .appex, and final code signature
# without trying to register a GUI application. On a user's Mac we install and
# launch the containing app so Safari receives the extension automatically.
if [ "${CI:-}" != "true" ]; then
  mkdir -p "$INSTALL_DIR"
  rm -rf "$CONTAINER_APP"
  ditto "$CONTAINER_SOURCE" "$CONTAINER_APP"
  open "$CONTAINER_APP"

  APPEX=$(find "$CONTAINER_APP/Contents/PlugIns" -maxdepth 2 -name '*.appex' -print -quit 2>/dev/null || true)
  [ -n "$APPEX" ] || { printf '%s\n' "Installed Safari containing app has no embedded extension." >&2; exit 1; }
  codesign --verify --deep --strict "$CONTAINER_APP" >/dev/null 2>&1 || { printf '%s\n' "Installed Safari containing app failed code-signature verification." >&2; exit 1; }

  printf '\nSafari extension packaged, ad-hoc signed, installed and launched:\n%s\n' "$CONTAINER_APP"
  printf 'Embedded extension: %s\n' "$APPEX"
  printf '%s\n' "If Safari has not previously been configured for unsigned development extensions, enable Safari Settings → Developer → Allow unsigned extensions once per Safari launch."
else
  printf '\nSafari Xcode project and containing app validated in CI:\n%s\n' "$CONTAINER_SOURCE"
fi
