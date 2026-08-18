# Conversations on the Plaza

English practice community site: applications with roles, class sign-ups, and a shared chat.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Realtime) — free tier
- Hosting: **Vercel**

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
   If the site already exists, also run these once:
   - [`supabase/chat-upgrade.sql`](supabase/chat-upgrade.sql) (announcements in chat + delete-own)
   - [`supabase/profile-upgrade.sql`](supabase/profile-upgrade.sql) (optional profile fields)
   - [`supabase/roles-announcements-upgrade.sql`](supabase/roles-announcements-upgrade.sql) (student/teacher/tech + homepage announcements)
   - [`supabase/application-fields-upgrade.sql`](supabase/application-fields-upgrade.sql) (optional “where from” / “how did you hear” on Apply)
   - [`supabase/class-topics-upgrade.sql`](supabase/class-topics-upgrade.sql) (optional Class Topics for a session)
3. **Authentication → Providers → Email**: enable Email. Turn **Confirm email ON** (the join flow needs the confirmation link).
4. **Authentication → URL configuration**:
   - Site URL: your Vercel URL, e.g. `https://YOUR-APP.vercel.app`
   - Redirect URLs (add both):
     - `https://YOUR-APP.vercel.app/auth/confirm`
     - `https://YOUR-APP.vercel.app/auth/callback`
     - optional local: `http://localhost:3000/auth/confirm`
5. **Project Settings → API**: copy **Project URL**, **anon public** key, and **service_role** key (keep service_role secret).
6. Emails:
   - **User confirmation email** is sent by **Supabase Auth** using **Custom SMTP (Gmail)** in the Supabase dashboard. Do not use Resend for that.
   - **Tech notice** of a confirmed application uses **Resend**. Set `RESEND_API_KEY` on Vercel. Notices also go to `plazaenglishgroup@gmail.com`.
   - **Approval email** to the new member uses **Gmail SMTP** on the server (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`). Do not put App Passwords in `NEXT_PUBLIC_*` vars.

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

### 4. Deploy on Vercel

Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Framework: Next.js.

Set these environment variables for Production (and Preview if you use preview deploys):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` = your `https://….vercel.app` (or custom domain)
- `RESEND_API_KEY` (Tech notice when a confirmed application is waiting)
- `EMAIL_FROM` (optional — verified Resend sender; do not put Gmail here)
- `APPROVAL_NOTIFY_EMAIL` (optional extra inbox; `plazaenglishgroup@gmail.com` is always included)
- `SMTP_HOST` = `smtp.gmail.com`
- `SMTP_PORT` = `587`
- `SMTP_USER` = Gmail address used for approval emails
- `SMTP_PASS` = Gmail App Password
- `SMTP_FROM` (optional — `Conversations on the Plaza <plazaenglishgroup@gmail.com>`)

After the first deploy, copy the Vercel URL into `NEXT_PUBLIC_SITE_URL` and into Supabase **Site URL** / **Redirect URLs**, then Redeploy. `NEXT_PUBLIC_*` values are baked in at build time.

Redeploy after saving. Registration and approvals then use real Supabase Auth + Postgres (demo cookie mode turns off automatically once URL + anon key are set).
