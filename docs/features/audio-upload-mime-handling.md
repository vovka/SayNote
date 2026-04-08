# Audio Upload MIME Handling

## Overview
Audio uploads are accepted based on normalized MIME type, not an exact string match. This matters because browser
recorders commonly emit parameterized MIME values such as `audio/webm;codecs=opus`.

## Key Files
- `shared/audio-mime.ts`: shared normalization, supported-type lookup, and file-extension mapping.
- `frontend/lib/recording/media-recorder.ts`: recorder prefers `audio/webm;codecs=opus` when supported.
- `frontend/app/api/audio/upload/route.ts`: normalizes uploaded file MIME before validation, storage, and job creation.
- `frontend/lib/api/upload-invariants.ts`: upload acceptance gate uses normalized MIME values.
- `backend/worker/storage/r2.ts`: storage keys and R2 `ContentType` use normalized MIME values.
- `frontend/lib/sync/sync-manager.ts`: upload filename extension is derived from the normalized MIME family.

## Important Details
- The upload route trusts the uploaded file MIME first and only falls back to the explicit `mimeType` form field if the
  file has no type.
- Supported aliases are normalized before validation, including codec-qualified WebM and WAV/MP3 variants.
- Persisted `audio_mime_type` values should stay in canonical form such as `audio/webm`, not
  `audio/webm;codecs=opus`.

## Common Pitfalls
- Exact MIME matching will reject browser-generated audio even when the underlying format is supported.
- Fixing only the HTTP route is incomplete; storage key extension and R2 `ContentType` must use the same normalized
  value.
- Filename extensions in multipart uploads are secondary. The real contract is the normalized MIME flowing through the
  API and storage layers.

## Validation
- Record a note in a browser that emits `audio/webm;codecs=opus` and confirm `/api/audio/upload` returns `200`.
- Confirm the created job stores `audio_mime_type = audio/webm`.
- Confirm uploaded R2 objects use `.webm` keys and `ContentType: audio/webm`.

---
Last updated: 2026-04-08
