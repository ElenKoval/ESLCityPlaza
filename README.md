# ESL on Plaza

English practice community site: applications with roles, class sign-ups, and a shared chat.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Realtime) — free tier
- Hosting: **Render** (Web Service, free)

## Hero photo

Put your plaza image here:

```text
public/hero.jpg
```

Also works: `hero.jpeg`, `hero.png`, or `hero.webp`. Refresh the homepage after adding it.

## Quick start

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com) (wait until it finishes provisioning).
2. **SQL Editor** → New query → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run.
   If chat already exists, also run [`supabase/chat-upgrade.sql`](supabase/chat-upgrade.sql) once (announcements + delete-own).
3. **Authentication → Providers → Email**: enable Email. For easy testing, turn **off** “Confirm email”.
4. **Authentication → URL configuration**:
   - Site URL: your Render URL, e.g. `https://esl-citi-plaza.onrender.com`
   - Redirect URLs: `https://esl-citi-plaza.onrender.com/auth/callback` and `http://localhost:3000/auth/callback`
5. **Project Settings → API**: copy **Project URL**, **anon public** key, and **service_role** key (keep service_role secret).

### 2. Local

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Make yourself Tech

Register once on the site, then in Supabase SQL Editor:

```sql
update public.profiles
set role = 'tech',
    status = 'approved',
    reviewed_at = now()
where id = (
  select id from auth.users where email = 'you@example.com'
);
```

### 4. Deploy on Render

Set these env vars on the web service (Blueprint lists them as `sync: false` so you fill them in the dashboard):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` = your `https://….onrender.com`

Redeploy after saving. Registration and approvals then use real Supabase Auth + Postgres (demo cookie mode turns off automatically once URL + anon key are set).
