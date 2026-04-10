# Supabase Auth Flow

## Overview
The frontend uses Supabase browser auth for Google sign-in and local session storage. Protected screens gate on the
browser session and attach the access token to API requests.

## Purpose
This flow keeps local development simple: Google OAuth signs the user into Supabase, the browser stores the session,
and API routes validate the bearer token server-side.

## Key Files And Structure
- `frontend/app/signin/page.tsx`: starts Google OAuth and builds the callback URL.
- `frontend/app/auth/callback/page.tsx`: completes the OAuth callback and redirects into the app.
- `frontend/lib/auth/redirect.ts`: sanitizes `next` and builds the callback URL.
- `frontend/lib/supabase/browser.ts`: creates the shared browser Supabase client.
- `frontend/components/auth-gate.tsx`: redirects unauthenticated users to `/signin`.
- `frontend/lib/api/client.ts`: attaches the Supabase access token to API requests.
- `frontend/lib/supabase/server.ts`: validates bearer tokens with Supabase on the server.

## How It Works
1. `AuthGate` checks `supabase.auth.getSession()`. Missing sessions redirect to `/signin?next=...`.
2. The sign-in page starts `signInWithOAuth` for Google and uses a callback URL under `/auth/callback`.
3. The browser client must use `flowType: 'pkce'` so Supabase returns a `code` query param.
4. The callback page exchanges that code for a browser session with `exchangeCodeForSession`.
5. API helpers read the browser session access token and send it as a bearer token.
6. Server helpers call `supabase.auth.getUser(token)` to resolve the authenticated user id.

## Important Patterns And Pitfalls
- `next` must be encoded into `redirectTo`. Supabase `queryParams` are provider params, not app redirect state.
- The callback page should treat missing `code` as recoverable and check for an already-established session first.
- Only allow relative `next` paths. Reject absolute URLs and protocol-relative paths to avoid open redirects.
- Kapture adds a class to `<body>`, which triggers a development hydration warning unless the layout suppresses it.

## Integration Points
- Supabase Auth provider configuration must include `http://localhost:3000/auth/callback`.
- Google OAuth is the only sign-in provider currently exposed by the app.
- API routes rely on a valid Supabase access token in the `authorization` header.

## Configuration
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for server-side token validation

## Testing Strategy
- `frontend/lib/auth/redirect.test.ts` covers safe redirect path handling and callback URL generation.
- Frontend unit tests verify auth-related helpers under `frontend/lib`.
- Manual verification should cover Google sign-in, callback exchange, and redirect back to the requested page.

## Known Issues Or Future Improvements
- Auth still lives entirely in the browser; a server-side callback route would make the flow less fragile.
- The callback page only surfaces basic provider error strings today.

---
Last updated: 2026-04-08
