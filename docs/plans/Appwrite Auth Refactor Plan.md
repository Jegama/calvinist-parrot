# Appwrite Auth Refactor Plan

Last updated: 2026-03-30

## Goal

Refactor authentication so the app uses Appwrite-validated server sessions for authenticated features, while still preserving anonymous chat usage and keeping guest chat history when a user successfully signs up.

This plan assumes the following product decision:

- Anonymous chat remains supported.
- Guest-to-account handoff happens on signup success only.
- Standard login does not merge guest chats into an existing account.
- Google OAuth follows the same intent split: signup flow can merge guest chats, login flow does not.

## Verified Current Setup

### Appwrite project setup

From the Appwrite dashboard screenshot, the project already has Web platforms configured under `Integrations > Platforms`:

- `Calvinist Parrot` with identifier `*.vercel.app`
- `Main website` with identifier `*.calvinistparrot.com`
- `Next.js app` with a Web platform entry present

This is relevant for auth, password recovery, and OAuth redirect allowlists.

The Appwrite Sites API returned no sites. That is not a contradiction.

- `Platforms` are used for auth redirects, browser SDK usage, and allowlisted origins.
- `Sites` are Appwrite's deployment product under `Deploy > Sites`.
- This project is currently using Appwrite Auth, not Appwrite Sites hosting.

Conclusion: auth-relevant platform configuration exists, but Appwrite Sites hosting is not currently in use.

### Auth behavior before this refactor

This section captures the pre-refactor state that motivated the migration:

- Browser auth uses the Appwrite Web SDK in `utils/appwrite.js`.
- Frontend auth state is derived with `account.get()` in `hooks/use-auth.tsx`.
- Backend authorization trusts a local `userId` cookie in `lib/auth.ts`.
- Profile bootstrap in `app/api/user-profile/route.ts` sets that `userId` cookie without validating Appwrite session state.
- Anonymous chat continuity is currently implemented by reusing the guest `userId` cookie as the Appwrite account ID in `components/RegisterForm.tsx`.
- Forgot-password initiation exists, but recovery completion does not.

## Why This Needs To Change

The current model mixes two identities:

- A real Appwrite-authenticated user from the browser SDK
- A local application cookie that the backend treats as authority

That creates three problems:

1. Authenticated server features are not actually bound to an Appwrite session.
2. Logout and backend authorization can drift apart.
3. Guest-to-signup continuity is achieved by coupling guest identity and Appwrite account identity, which becomes fragile once OAuth or stricter server auth is introduced.

The fix is not to remove guest support. The fix is to separate guest identity from authenticated identity and make each route use the right one.

## Product Decisions For This Refactor

These decisions are baked into the implementation plan.

### Decision 1: signup-only guest handoff

Guest chat history should move into an account only when the user signs up successfully.

That means:

- Email registration merges guest chats into the newly created account.
- Google signup can merge guest chats when the flow starts from the signup intent.
- Email login does not merge guest chats.
- Google login does not merge guest chats.

### Decision 2: no automatic merge on ordinary login

Default recommendation: do not merge guest chats into an existing account during login.

Reasons:

- It is safer and easier to reason about.
- It avoids surprising users by attaching temporary anonymous data to an older account.
- It keeps signup behavior clear: guest activity becomes part of the account only when the user chooses to create one.

This can be revisited later, but it should not be in the first auth hardening pass.

### Decision 3: anonymous chat remains first-class

Anonymous users must still be able to:

- start chats
- continue their chats
- see their chat sidebar in the same browser

This means chat routes must support two actor types:

- authenticated Appwrite user
- anonymous guest

All other sensitive app features should remain authenticated-only.

## Target Architecture

### Identity model

Use two separate identities:

- `Appwrite user session` for authenticated features
- `guestId` cookie for anonymous chat-only flows

Retire the current shared `userId` cookie model.

### Source of truth by route type

Use the Appwrite session cookie as the source of truth for authenticated routes.

Authenticated-only routes include:

- profile
- prayer tracker
- journal
- kids discipleship
- any route that mutates or reads private account-scoped data

Use guest identity only for explicitly anonymous-safe routes.

Anonymous-safe routes include:

- chat creation
- chat continuation
- chat retrieval
- chat sidebar listing for the same browser guest

### Cookie model

#### 1. Appwrite session cookie

Cookie name:

- `a_session_<PROJECT_ID>`

Purpose:

- identifies an authenticated Appwrite session on server requests

Properties:

- `httpOnly: true`
- `secure: true` in production
- `sameSite: "lax"` or `"strict"` depending on final OAuth callback behavior
- `path: "/"`

#### 2. Guest cookie

Cookie name:

- `guestId`

Purpose:

- identifies anonymous chat ownership in the current browser

Properties:

- should be server-managed
- preferably `httpOnly`
- `sameSite: "lax"`
- long-lived enough for chat continuity

Important note:

- If the frontend stops sending `userId` to chat routes, `guestId` can safely be `httpOnly` because only the server needs to read it.

#### 3. Auth intent cookie

Cookie name:

- `authIntent`

Allowed values:

- `signup`
- `login`

Purpose:

- distinguishes whether OAuth callback should behave like signup or login

Properties:

- short-lived
- server-managed
- cleared after callback completes

### Server-side Appwrite clients

Add a server-only Appwrite helper module with:

- admin client initialized with API key
- per-request session client initialized from `a_session_<PROJECT_ID>`

Important rules:

- never reuse a session client across requests
- never expose API key values to the browser
- do not trust request body `userId` for authenticated routes

## Environment Variables

### Keep

- `NEXT_PUBLIC_APPWRITE_ENDPOINT`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`

These can remain if any client-side Appwrite SDK usage is kept.

### Add

- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APP_URL`

Notes:

- `APPWRITE_ENDPOINT` should be the exact regional endpoint from Appwrite project settings, not the generic cloud host unless that is truly what the project is configured to use.
- `APP_URL` should be the canonical app base URL used for recovery and OAuth callback construction.

### Recommended API key scopes

Required minimum:

- `sessions.write`

If registration is moved fully server-side using the server SDK user APIs, also add:

- `users.write`

## Appwrite Console Checklist

### Platforms

Already observed from the screenshot:

- wildcard Vercel domain
- wildcard custom production domain
- extra Web platform entry

Still verify explicitly:

- localhost dev origin is included if local OAuth or recovery testing is required
- all exact callback domains used in development and production are allowlisted

### Auth settings

Configure or verify:

- Email/password auth enabled
- Google OAuth provider enabled
- Google client ID and secret entered
- allowed success/failure URLs match actual app routes
- password recovery redirect points to a real reset route in this app

### Password policies

Review in Appwrite Auth settings:

- password dictionary
- password history
- disallow personal data in passwords

## Phase 1: Build Server Auth Primitives

### New modules

Create:

- `lib/appwrite/server.ts`
- `lib/auth.ts` refactor or split into:
  - `lib/auth/authenticated-user.ts`
  - `lib/auth/chat-actor.ts`
- `lib/guest.ts`

### Responsibilities

#### `lib/appwrite/server.ts`

Provide:

- `createAdminAppwriteClient()`
- `createSessionAppwriteClient(sessionSecret: string)`
- `getAppwriteAccountFromSessionCookie()` helper if desired

#### `lib/auth.ts`

For authenticated-only routes, expose:

- `getAuthenticatedUser()`
- `getAuthenticatedUserId()`
- `requireAuthenticatedUser()`

These helpers must:

- read the Appwrite session cookie
- initialize a session client
- call Appwrite `account.get()`
- return the verified Appwrite user

#### `lib/guest.ts`

Expose:

- `getGuestId()`
- `ensureGuestId()`
- `clearGuestId()`

For anonymous-safe chat routes, add a helper such as:

- `resolveChatActor()`

Suggested return shape:

```ts
type ChatActor =
  | { kind: "authenticated"; userId: string }
  | { kind: "guest"; guestId: string };
```

Behavior:

- if valid Appwrite session exists, return authenticated actor
- else if guest cookie exists, return guest actor
- else create guest cookie and return guest actor

## Phase 2: Replace The Shared `userId` Cookie Model

Status: completed.

Current coupling between guest identity and Appwrite account identity should be removed.

### Required changes

- stop setting `userId` as the app's backend authority cookie
- replace guest identity with a dedicated `guestId`
- stop using request body/query `userId` as proof of ownership

### Frontend implications

The frontend no longer needs to send `userId` to chat routes purely for authorization.

Target behavior:

- `POST /api/parrot-chat` resolves actor from cookies on the server
- `GET /api/parrot-chat?chatId=...` resolves actor from cookies on the server
- `GET /api/user-chats` resolves actor from cookies on the server

This makes the auth boundary much cleaner and allows `guestId` to become server-managed.

## Phase 3: Add Server Auth Endpoints

Create auth endpoints under `app/api/auth/**`.

### `GET /api/auth/me`

Purpose:

- return current authenticated user and app profile if session exists
- return unauthenticated state otherwise

Suggested response shape:

```json
{
  "authenticated": true,
  "user": { "id": "...", "email": "...", "name": "..." },
  "profile": { "denomination": "reformed-baptist" }
}
```

### `POST /api/auth/register`

Purpose:

- create Appwrite user
- create Appwrite session
- set Appwrite session cookie
- upsert app profile
- perform signup-only guest chat handoff

Expected input:

- `name`
- `email`
- `password`

Suggested behavior:

1. Create the Appwrite account.
2. Create Appwrite email/password session.
3. Set `a_session_<PROJECT_ID>` cookie.
4. Upsert `userProfile`.
5. If `guestId` exists, migrate guest chats to new Appwrite user.
6. Clear `guestId` after successful migration.
7. Return authenticated user payload.

### `POST /api/auth/login`

Purpose:

- create Appwrite session
- set Appwrite session cookie
- upsert profile if needed

Important behavior:

- do not migrate guest chats on login

### `POST /api/auth/logout`

Purpose:

- delete current Appwrite session
- clear app session cookie

Post-logout behavior:

- keep no authenticated authority cookie
- allow a fresh guest cookie to be minted later for new anonymous chats

### `POST /api/auth/password/recovery`

Purpose:

- initiate Appwrite recovery email using a real reset URL

Reset URL target:

- `APP_URL/reset-password`

### `POST /api/auth/password/reset`

Purpose:

- complete Appwrite recovery flow using `userId`, `secret`, and `password`

### `GET /api/auth/oauth/google/start`

Purpose:

- set `authIntent` cookie
- redirect to Appwrite Google OAuth start URL

Supported intents:

- `signup`
- `login`

### `GET /api/auth/oauth/callback`

Purpose:

- receive Appwrite OAuth callback params
- create Appwrite session from callback secret
- set Appwrite session cookie
- upsert profile
- optionally run signup-only guest migration

Recommended callback behavior:

1. Read `authIntent` cookie.
2. Create Appwrite session using callback `userId` and `secret`.
3. Fetch authenticated Appwrite user.
4. Upsert local `userProfile`.
5. If `authIntent === "signup"`, and this is the first local bootstrap for this account, migrate guest chats.
6. Clear `authIntent`.
7. Redirect to app.

### Google signup detection rule

For the first version, use this rule:

- only attempt guest merge when `authIntent === "signup"`
- and no local `userProfile` existed before the callback completed

This gives predictable behavior without merging on ordinary login.

## Phase 4: Frontend Refactor

### Auth provider

Status: completed.

Refactor `hooks/use-auth.tsx` so it no longer depends on `account.get()` as the auth source of truth.

Target behavior:

- fetch `/api/auth/me`
- store authenticated user state from the server response
- expose `refresh()` and `logout()` methods backed by app API routes

### Login form

Refactor `components/LoginForm.tsx` to submit to:

- `POST /api/auth/login`

Add:

- `Continue with Google` button that starts OAuth with `intent=login`

### Register form

Refactor `components/RegisterForm.tsx` to submit to:

- `POST /api/auth/register`

Remove the current logic that reuses the guest cookie as the Appwrite user ID.

Add:

- `Sign up with Google` button that starts OAuth with `intent=signup`

### Forgot password form

Refactor `components/ForgotPasswordForm.tsx` to call:

- `POST /api/auth/password/recovery`

Use a real app reset route instead of `https://example.com/reset-password`.

### Reset password page

Create:

- `app/reset-password/page.tsx`

Behavior:

- read `userId` and `secret` from query params
- collect new password
- call `POST /api/auth/password/reset`
- show success/failure state

### Remove frontend auth dependence on `useUserIdentifier()` for authenticated identity

Current `useUserIdentifier()` mixes guest and Appwrite identity.

Target behavior:

- authenticated identity comes from `useAuth()`
- guest continuity is handled by server cookies
- chat pages no longer need to pass `userId` for access control

Possible options:

- simplify `useUserIdentifier()` into a guest bootstrap helper only
- or replace it with a new `useActorState()` hook if the UI needs actor awareness

## Phase 5: Chat Route Refactor

### `app/api/parrot-chat/route.ts`

Refactor this route so it uses `resolveChatActor()` instead of `requireAuthenticatedUser(userId)`.

Rules:

- anonymous users may create and continue only their own guest chats
- authenticated users may create and continue only their own account chats
- request body `userId` is no longer treated as authority

### `app/api/user-chats/route.ts`

Refactor this route so it lists chats for the resolved actor:

- authenticated Appwrite user id
- or guest id

### Chat ownership model

The baseline plan does not require a Prisma schema change.

Existing `chatHistory.userId` can remain a string.

Interpretation becomes:

- Appwrite user id when `kind === "authenticated"`
- guest id when `kind === "guest"`

### Optional schema hardening

Optional future improvement:

- add an `ownerType` enum to `chatHistory`

This is not required for the first secure refactor, but it would make ownership semantics clearer.

## Phase 6: Signup-Only Guest Handoff

### Scope

The handoff should apply to:

- chat conversations in `chatHistory`
- optionally `questionHistory` if guest QA continuity matters too

Minimum required scope based on current product intent:

- `chatHistory`

### Migration helper

Add a server helper, for example:

- `transferGuestChatsToUser(guestId, appwriteUserId)`

Suggested implementation:

```ts
await prisma.$transaction(async (tx) => {
  await tx.chatHistory.updateMany({
    where: { userId: guestId },
    data: { userId: appwriteUserId },
  });
});
```

If `questionHistory` should be included, add a matching update.

### Register flow handoff

Email signup flow:

1. User has guest chats under `guestId`.
2. User submits register form.
3. Server creates Appwrite account and session.
4. Server migrates guest chats to the new Appwrite user id.
5. Server clears `guestId`.
6. Future chat access is via Appwrite session.

### Login flow behavior

Login flow should not migrate guest chats.

Result:

- existing account logs in normally
- guest chats remain guest-owned and are not attached to that account

### Google OAuth flow behavior

Signup intent:

- user clicks `Sign up with Google`
- server sets `authIntent=signup`
- callback performs guest merge only if this is the first local bootstrap for that account

Login intent:

- user clicks `Continue with Google`
- server sets `authIntent=login`
- callback never performs guest merge

## Phase 7: Refactor Existing APIs To Use Real Auth Boundaries

After server auth primitives are in place, update all protected APIs that currently depend on `requireAuthenticatedUser(providedUserId)`.

New rule:

- protected APIs derive the user from Appwrite session cookie only
- request payload `userId` may still be accepted for compatibility during rollout, but must be ignored for authorization

High-impact route groups:

- `app/api/profile/**`
- `app/api/prayer-tracker/**`
- `app/api/journal/**`
- `app/api/kids-discipleship/**`
- `app/api/user-profile/route.ts`
- `app/api/user-memory/route.ts`
- `app/api/user-questions/route.ts`

## Planned File Changes

### New files

- `lib/appwrite/server.ts`
- `lib/guest.ts`
- `app/api/auth/me/route.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/register/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/password/recovery/route.ts`
- `app/api/auth/password/reset/route.ts`
- `app/api/auth/oauth/google/start/route.ts`
- `app/api/auth/oauth/callback/route.ts`
- `app/reset-password/page.tsx`

### Existing files to refactor

- `lib/auth.ts`
- `hooks/use-auth.tsx`
- `hooks/use-user-identifier.ts` (removed during implementation)
- `components/LoginForm.tsx`
- `components/RegisterForm.tsx`
- `components/ForgotPasswordForm.tsx`
- `app/page.tsx`
- `app/[chatId]/page.tsx`
- `hooks/use-chat-list.ts`
- `app/api/parrot-chat/route.ts`
- `app/api/user-chats/route.ts`
- `app/api/user-profile/route.ts`

## Recommended Rollout Order

1. Add env vars, server Appwrite helper, and new auth routes.
2. Refactor `useAuth()` and auth forms to use app API routes.
3. Implement real password recovery completion.
4. Split guest identity from authenticated identity.
5. Refactor chat routes to resolve actor from cookies.
6. Implement signup-only guest chat migration.
7. Add Google OAuth buttons and callback logic.
8. Migrate remaining protected APIs away from request-body `userId` authorization.

## Test Matrix

### Email auth

- guest starts chats, then registers, chats appear in new account
- guest starts chats, then logs into existing account, chats do not merge
- authenticated user logout removes authenticated access
- login failure shows proper error state

### Google OAuth

- guest uses Google signup path, signup merge runs only on signup intent
- guest uses Google login path, no merge occurs
- existing Google-linked user logging in via signup button does not accidentally merge if local profile already exists

### Password reset

- recovery email sends successfully
- reset link lands on real app route
- password can be updated with valid `userId` and `secret`
- expired or invalid secret shows proper error state

### Auth hardening

- protected APIs reject requests with no valid Appwrite session
- tampered request body `userId` no longer grants access
- guest can access only guest-safe chat endpoints
- one browser guest cannot access another guest's chats without the matching cookie

## Open Questions

### 1. Should `questionHistory` also be migrated on signup?

Current product requirement explicitly mentions chat conversations. If QA history should also follow signup, include it in the migration helper.

### 2. Should chat ownership get an explicit `ownerType` field later?

Not required for phase one. Worth considering after the auth boundary is fixed.

### 3. Should Google signup guest merge ship in the first pass?

Recommended answer:

- yes, if implemented through explicit signup intent and local-profile absence check
- otherwise defer Google guest merge and ship Google login first

## Final Recommendation

Implement the secure server-session refactor first, while preserving anonymous chat through a dedicated `guestId` actor model.

Do not keep the current behavior where signup works by reusing the guest cookie as the Appwrite user ID.

Instead:

- keep guest identity separate
- authenticate server-side with Appwrite session cookie
- migrate guest chats into the new account only on signup success

That gives the app a clean long-term model that still preserves the user experience you wanted.