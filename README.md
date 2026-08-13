# ESL Citi Plaza

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

1. Create a project at [supabase.com](https://supabase.com)
2. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql)
3. Authentication → Email enabled (you can disable Confirm email for testing)
4. Settings → API: copy Project URL and `anon` key

### 2. Local

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 3. Make yourself Tech

```sql
update public.profiles
set role = 'tech',
    status = 'approved',
    reviewed_at = now()
where id = 'YOUR-USER-UUID';
```

### 4. Deploy on Render

See [`render.yaml`](render.yaml). Set env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then deploy.

In Supabase Auth URL config use your `https://….onrender.com` Site URL.
