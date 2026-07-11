# Android build (MixOrder)

MixOrder is packaged as a native Android application through
[Capacitor](https://capacitorjs.com/). The web app is bundled inside the APK
— no server required at runtime — which matches the product principle: all
audio work happens locally on the device.

## Automatic APK on every change

The GitHub workflow `.github/workflows/android.yml` runs on every push and:

1. Builds the TanStack Start web bundle (`bun run build`).
2. Generates the `android/` Capacitor project (if missing) and syncs the
   web bundle into it.
3. Regenerates launcher icon + splash from `resources/icon.png` and
   `resources/splash.png` using `@capacitor/assets`.
4. Builds a debug APK with Gradle.
5. Uploads it as the workflow artifact **MixOrder-debug-apk**.

Download the APK from the **Actions** tab → latest workflow run →
Artifacts.

## Local build

```bash
bun install
bun run build
bunx cap add android          # first time only
bunx cap sync android
bunx capacitor-assets generate --android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Brand assets

- `resources/icon.png` — 1024×1024 launcher icon (foreground)
- `resources/icon-foreground.png` / `resources/icon-background.png` —
  adaptive icon layers
- `resources/splash.png` — 2732×2732 splash artwork

Regenerate on any brand update:

```bash
bunx capacitor-assets generate --android
```

## App identity

Defined in `capacitor.config.ts`:

- `appId`: `app.mixorder.dj`
- `appName`: `MixOrder`
- Dark theme background: `#232323`

## Guidelines for future features

To keep the automatic APK build green, every future change must:

- Stay compatible with a **static web build** — no runtime server calls
  required for the core UX. Use `createServerFn` only for optional online
  features and always ship a local fallback.
- Prefer **Capacitor plugins** (`@capacitor/filesystem`,
  `@capacitor/preferences`, `@capacitor/haptics`, etc.) over browser-only
  APIs when adding native capabilities. Install via `bun add` so they are
  picked up by `cap sync` in CI.
- Declare any new Android permission in `capacitor.config.ts` **and** patch
  `android/app/src/main/AndroidManifest.xml` via a `cap` hook or a commit
  after the first `cap add android` run.
- Never commit anything under `android/app/build/` or `.gradle/`
  (already ignored).
