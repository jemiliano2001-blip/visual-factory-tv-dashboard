# Anonymous Session Route Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ProtectedRoute` and `Login` distinguish a real (Email/Password) Firebase session from the anonymous session the public TV dashboard creates for itself, so `/admin` and `/stats` can never be reached by an anonymous visitor.

**Architecture:** Add a single pure helper `isRealUser(user)` to `src/firebase.ts` (mirrors the existing `isRealUser()` Firestore rule), then swap the two call sites (`ProtectedRoute.tsx`, `Login.tsx`) from raw `auth.currentUser` truthiness checks to `isRealUser(auth.currentUser)`.

**Tech Stack:** React + TypeScript + Firebase Auth (`firebase/auth`), React Router. No test framework in this repo — `tsc --noEmit` (`npm run lint`) is the only automated gate; behavior is verified manually via Playwright MCP tools, consistent with how every other fix in this project has been verified.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-anonymous-session-route-guard-design.md`
- Do NOT touch `App.tsx`'s `signInAnonymously()` call, `firestore.rules`, or `functions/src/index.ts` — out of scope per spec.
- Do NOT enable Anonymous Auth in Firebase Console as part of this work — that's a separate, deliberately deferred decision (see spec's "Out of Scope").
- Do NOT hardcode real admin credentials anywhere in this plan, in committed code, or in any file written to the repo.
- This repo has no unit test runner — do not introduce one. Use `npm run lint` (`tsc --noEmit`) as the compile gate.

---

### Task 1: Add `isRealUser` helper and apply it to `ProtectedRoute`

**Files:**
- Modify: `src/firebase.ts`
- Modify: `src/components/ProtectedRoute.tsx`

**Interfaces:**
- Produces: `isRealUser(user: import('firebase/auth').User | null): boolean` exported from `src/firebase.ts`, alongside the existing `db` and `auth` exports. Returns `true` only when `user` is non-null and `user.isAnonymous === false`.

- [ ] **Step 1: Add the `isRealUser` helper to `src/firebase.ts`**

Current file:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
```

Change to:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, type User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Mirrors firestore.rules' isRealUser(): the public TV dashboard signs every
// visitor in anonymously to satisfy Firestore's auth != null rule. A session
// only counts as "logged in" if it's a real account, not that anonymous one.
export function isRealUser(user: User | null): boolean {
  return user != null && !user.isAnonymous;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
```

- [ ] **Step 2: Verify `isRealUser`'s logic with a throwaway script**

Create a temporary file at the repo root, `tmp-verify-is-real-user.ts`:

```ts
import { isRealUser } from './src/firebase';
import type { User } from 'firebase/auth';

const cases: Array<[string, User | null, boolean]> = [
  ['null user', null, false],
  ['anonymous user', { isAnonymous: true } as User, false],
  ['real user', { isAnonymous: false } as User, true],
];

let failed = false;
for (const [label, input, expected] of cases) {
  const actual = isRealUser(input);
  if (actual !== expected) {
    failed = true;
    console.error(`FAIL: ${label} -> expected ${expected}, got ${actual}`);
  } else {
    console.log(`PASS: ${label}`);
  }
}
process.exit(failed ? 1 : 0);
```

Run: `npx tsx tmp-verify-is-real-user.ts`

Expected output:
```
PASS: null user
PASS: anonymous user
PASS: real user
```

This imports the real `src/firebase.ts` module, so it also performs Firebase's normal app init and the existing `testConnection()` Firestore read (same as any page load) — that's expected, not an error.

- [ ] **Step 3: Delete the throwaway verification file**

```bash
rm tmp-verify-is-real-user.ts
```

It must NOT be committed — confirm with `git status` that it's gone before the next step.

- [ ] **Step 4: Apply `isRealUser` to `ProtectedRoute.tsx`**

Current file (`src/components/ProtectedRoute.tsx`):

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  if (!auth.currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

Change to:

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, isRealUser } from '../firebase';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  
  if (!isRealUser(auth.currentUser)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 5: Compile check**

Run: `npm run lint`
Expected: exits cleanly, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/firebase.ts src/components/ProtectedRoute.tsx
git commit -m "fix(auth): ProtectedRoute ignores anonymous Firebase sessions

Adds isRealUser(user) to src/firebase.ts, mirroring firestore.rules'
isRealUser() (excludes the anonymous provider). ProtectedRoute now
gates /admin and /stats on isRealUser(auth.currentUser) instead of
raw truthiness, so an anonymous TV session can never pass as a real
admin login if Anonymous Auth is ever re-enabled in Firebase Console."
```

---

### Task 2: Apply `isRealUser` to `Login`

**Files:**
- Modify: `src/pages/Login.tsx`

**Interfaces:**
- Consumes: `isRealUser(user: User | null): boolean` from `src/firebase.ts` (Task 1).

- [ ] **Step 1: Update the auto-redirect guard in `Login.tsx`**

Current (`src/pages/Login.tsx`, lines 1-18):

```tsx
import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Tv } from 'lucide-react';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  if (auth.currentUser) {
    return <Navigate to={from} replace />;
  }
```

Change to:

```tsx
import React, { useState } from 'react';
import { auth, isRealUser } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Tv } from 'lucide-react';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  if (isRealUser(auth.currentUser)) {
    return <Navigate to={from} replace />;
  }
```

(Only the import line and the `if` condition change — the rest of the file, including `handleLogin` and the JSX form, stays exactly as-is.)

- [ ] **Step 2: Compile check**

Run: `npm run lint`
Expected: exits cleanly, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "fix(auth): Login no longer self-redirects on an anonymous session

Same isRealUser() guard as ProtectedRoute (Task 1) — without this,
an anonymous TV session would make auth.currentUser truthy and the
login form would redirect itself away before a real admin could ever
type their credentials, the moment Anonymous Auth is re-enabled."
```

---

### Task 3: End-to-end verification

**Files:** none (verification only, no code changes)

**Interfaces:**
- Consumes: the running dev server (`npm run dev:full`) and an existing real Firebase Email/Password admin account (the operator's own credentials — do not write them into any file).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev:full
```

Wait for both Vite and the Odoo proxy to report ready. Note the printed Vite port (defaults to 3000; if occupied, Vite will print whatever port it actually bound).

- [ ] **Step 2: Confirm `/admin` and `/stats` still redirect to `/login` with no session**

Using the Playwright MCP tools (`mcp__plugin_playwright_playwright__browser_navigate`, `browser_snapshot`):

1. Navigate to `http://localhost:<port>/admin`.
2. Take a snapshot. Expected: URL is now `/login` and the login form (email/password fields, "Acceso exclusivo para personal SMV.") is visible — not the admin panel.
3. Navigate to `http://localhost:<port>/stats`.
4. Take a snapshot. Expected: URL is now `/login` again — not the stats dashboard.

This must pass regardless of whether Anonymous Auth is enabled in Firebase Console, since `isRealUser` returns `false` for both "no session" and "anonymous session".

- [ ] **Step 3: Confirm a real admin login still reaches `/admin` and `Login` redirects away afterward**

Using Playwright MCP tools:

1. Navigate to `http://localhost:<port>/login`.
2. Take a snapshot, confirm the login form renders (not redirected).
3. Fill the email and password fields with a real admin account you have access to, then submit (`browser_type` into each field, then `browser_click` the submit button — do not paste credentials into any committed file or this plan).
4. Take a snapshot. Expected: redirected to `/admin`, admin panel content visible.
5. Navigate to `http://localhost:<port>/login` again while still logged in.
6. Take a snapshot. Expected: immediately redirected away (back to `/`, since `from` has no state on a fresh navigation) — confirms `isRealUser` correctly returns `true` for a real session and the existing "already logged in" redirect behavior is unchanged.

- [ ] **Step 4: Record the known limitation**

Anonymous Auth is currently disabled in the `smv-brain` Firebase project (separate, deliberate decision — see spec's "Out of Scope"), so `signInAnonymously()` always fails in this environment and an anonymous Firebase session cannot be produced to directly observe `isRealUser` rejecting it end-to-end. Step 2 above (no-session → redirect to `/login`) is the closest available live check today. If Anonymous Auth is ever enabled later, re-run Step 2 — it should still redirect to `/login` even though `auth.currentUser` will now be non-null (the anonymous user).

No commit for this task — it's verification only.
