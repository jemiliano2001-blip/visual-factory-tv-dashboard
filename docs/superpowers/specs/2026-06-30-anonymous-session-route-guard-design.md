# Anonymous Session Route Guard — Design Spec

**Date:** 2026-06-30
**Project:** Visual Factory TV Dashboard
**Status:** Approved

---

## Context

The public TV dashboard signs every visitor in **anonymously** on load (`App.tsx` → `signInAnonymously(auth)`), so it can pass Firestore's `request.auth != null` rule without requiring a real login. This was restored on 2026-06-27 (commit `befc74f`) after an earlier attempt (2026-06-23, commit `5f616fe`) to require a real account for everything broke public TV access.

`ProtectedRoute.tsx` and `Login.tsx` both gate on `auth.currentUser` truthiness alone — neither checks whether that user is the anonymous session or a real, logged-in admin. `firestore.rules` already solved this correctly with an `isRealUser()` helper (`request.auth != null && request.auth.token.firebase.sign_in_provider != 'anonymous'`), used for all `company_configs` writes. The client-side code never adopted the same distinction.

Today this is latent — Firebase Anonymous Auth is currently **disabled** in the `smv-brain` project's Authentication settings (a separate, unrelated outage), so `signInAnonymously()` always fails and `auth.currentUser` stays `null` for anyone who hasn't done a real login. The moment Anonymous Auth is enabled again, this gap becomes live:

- `ProtectedRoute` would let any visitor into `/admin` and `/stats` — full read access to all Odoo order/client data and AI features — without a real account.
- `Login` would redirect itself away immediately (because `auth.currentUser` is already truthy from the anonymous session), so a real admin could never reach the login form to authenticate.

This spec closes that gap so the route guard is safe regardless of whether Anonymous Auth is enabled.

---

## Architecture

### Files

| File | Change |
|------|--------|
| `src/firebase.ts` | New — export `isRealUser(user: User \| null): boolean` |
| `src/components/ProtectedRoute.tsx` | Edit — gate on `isRealUser(auth.currentUser)` instead of `!!auth.currentUser` |
| `src/pages/Login.tsx` | Edit — only auto-redirect away from the login form when `isRealUser(auth.currentUser)` |

### `isRealUser`

```ts
import type { User } from 'firebase/auth';

export function isRealUser(user: User | null): boolean {
  return user != null && !user.isAnonymous;
}
```

Mirrors `firestore.rules`' `isRealUser()` by name and intent: a session only counts as "logged in" if it's backed by a real provider (Email/Password today; Google previously), not the anonymous session the public TV creates for itself.

### What does NOT change

- `App.tsx`'s `signInAnonymously()` call and the TV's public access — untouched.
- `firestore.rules` — already correct.
- The Cloud Function (`functions/src/index.ts`) auth middleware and the `/api/odoo/*` public exemption shipped earlier today — untouched. (Hardening `/api/ai/generate` against anonymous tokens was considered and explicitly deferred — out of scope for this fix.)

### Data Flow (unchanged, now correctly gated)

```
Anonymous visitor loads /admin
  → App.tsx: signInAnonymously() succeeds (if Anonymous Auth enabled)
  → ProtectedRoute: isRealUser(auth.currentUser) → false (isAnonymous === true)
  → redirect to /login

Anonymous visitor loads /login
  → isRealUser(auth.currentUser) → false → login form renders normally

Real admin (Email/Password) loads /login while already logged in
  → isRealUser(auth.currentUser) → true → redirect to `from` / "/"
```

---

## Testing

Manual verification via Playwright against the dev build, simulating an anonymous-only session (no real login):

1. Navigate to `/admin` → expect redirect to `/login`, not the admin panel.
2. Navigate to `/stats` → expect redirect to `/login`.
3. Navigate to `/login` directly → expect the login form to render (no auto-redirect).
4. Log in with a real account, then navigate to `/login` again → expect redirect away (existing behavior preserved).

`npm run lint` (`tsc --noEmit`) must pass — this is the only automated gate in the repo.

---

## Out of Scope

- Re-architecting whether the TV should rely on Firebase Anonymous Auth at all (deferred — current Odoo-data path no longer depends on it after today's Cloud Function fix; only `company_configs` delivery schedules still do).
- Hardening `/api/ai/generate` against anonymous tokens.
- Enabling Anonymous Auth in Firebase Console (a separate, manual Console action — not blocked by this fix, but also not required by it).
