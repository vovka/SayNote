# PWA Installability Checklist

This checklist verifies that SayNote meets installability expectations across Chromium platforms, while documenting Safari/iOS limitations.

## Manifest and asset prerequisites

- [x] `frontend/app/manifest.ts` exports installable metadata:
  - `name`: `SayNote`
  - `short_name`: `SayNote`
  - `start_url`: `/`
  - `display`: `standalone`
  - `background_color`: `#ffffff`
  - `theme_color`: `#111111`
- [x] Manifest icons include:
  - `192x192` PNG (`purpose: any`)
  - `512x512` PNG (`purpose: any`)
  - `512x512` PNG (`purpose: maskable`)
- [x] Service worker registration points to `/sw.js`.
- [x] The app is served from HTTPS in production (required by browser installability checks).

## Android Chrome installability verification

1. Open SayNote over HTTPS in Chrome for Android.
2. Open DevTools remote inspection (optional) and check **Application > Manifest**.
3. Confirm no manifest or icon fetch errors.
4. Confirm service worker shows as **activated and running**.
5. Trigger install:
   - from omnibox install icon, or
   - browser menu `Add to Home screen`/`Install app`.
6. Confirm standalone launch from home screen icon.
7. Confirm splash/icon uses expected artwork, including maskable safe area behavior.

## Desktop Chromium installability verification

1. Open SayNote in Chrome/Edge desktop over HTTPS.
2. Open DevTools > **Application > Manifest** and verify no warnings blocking install.
3. Confirm install affordance appears in omnibox/app menu.
4. Install and launch app window.
5. Confirm:
   - standalone window opens to `/`
   - icon quality is correct in app launcher and task switcher
   - reload after install keeps service worker functional

## iOS / Safari limitations (documented constraints)

Safari on iOS has partial PWA support and differs from Chromium:

- No Chrome-style install prompt heuristics (`beforeinstallprompt` is not available).
- Installation uses **Share > Add to Home Screen** user flow.
- Manifest support is limited compared to Chromium; behavior can vary by iOS version.
- Push/background capabilities and storage behavior are more constrained than Chromium.

Because of these platform constraints, validate iOS as a best-effort home-screen web app experience rather than full Chromium-equivalent installability.
