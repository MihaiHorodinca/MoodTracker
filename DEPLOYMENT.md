# MoodBloom — Deployment Guide

This guide takes you from zero to a fully live, cross-device mood tracker in about 15 minutes.
No command-line experience required for the Netlify option.

---

## Overview

| Part | Service | Free? |
|------|---------|-------|
| Database | Supabase | Yes — free forever tier |
| Hosting  | Netlify (recommended) or Vercel | Yes — free tier |

---

## Part 1 — Set Up the Database (Supabase)

### Step 1 — Create a free Supabase account
1. Go to **https://supabase.com** and click **Start your project**.
2. Sign up with GitHub or email.

### Step 2 — Create a new project
1. Click **New Project**.
2. Choose an organisation (your personal one is fine).
3. Enter a **Project name** (e.g. `moodbloom`).
4. Enter a strong **Database Password** (save it somewhere safe).
5. Choose a **Region** closest to you.
6. Click **Create new project** and wait ~2 minutes for provisioning.

### Step 3 — Create the entries table
1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Paste the following SQL and click **Run** (▶):

```sql
create table entries (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  mood_label  text        not null,
  mood_emoji  text        not null,
  intensity   integer     not null check (intensity between 1 and 10),
  description text        not null default '',
  timestamp   timestamptz not null default now()
);

-- Allow anyone to read, insert and delete without logging in
alter table entries enable row level security;

create policy "public select"
  on entries for select using (true);

create policy "public insert"
  on entries for insert with check (true);

create policy "public delete"
  on entries for delete using (true);
```

You should see **"Success. No rows returned"** — that's correct.

### Step 4 — Get your API credentials
1. In the left sidebar click **Project Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **Project API key → anon / public** — a long string starting with `eyJ…`

---

## Part 2 — Configure the App

### Step 5 — Edit `js/config.js`
Open `js/config.js` in any text editor and replace the two placeholder strings:

```js
const CONFIG = {
  SUPABASE_URL:      'https://xxxxxxxxxxxx.supabase.co',   // ← paste Project URL
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIs...',           // ← paste anon key
};
```

Save the file. The yellow setup banner in the app will disappear once this is correct.

---

## Part 3 — Deploy the App

### Option A — Netlify (drag & drop, recommended)

> No account or CLI needed beyond a browser.

1. Go to **https://netlify.com** and sign up for free.
2. From the dashboard click **Add new site → Deploy manually**.
3. Open your **File Explorer** and navigate to the `MoodTracker` folder.
4. **Drag the entire `MoodTracker` folder** onto the Netlify upload box.
5. Netlify will give you a URL like `https://cute-name-12345.netlify.app`.
6. Click the URL — your app is live!

**To update later:** Repeat steps 2–5 with the updated folder. Netlify keeps your URL the same.

---

### Option B — Vercel (via CLI)

> Requires Node.js installed (which you already have).

```bash
# 1. Install the Vercel CLI once
npm install -g vercel

# 2. Inside the MoodTracker folder, run:
vercel

# 3. Follow the prompts:
#    - Log in / create account
#    - Confirm project name
#    - Answer "N" to all framework questions (it's a plain HTML site)

# 4. Vercel prints a URL like https://moodbloom.vercel.app
```

**To redeploy after changes:** run `vercel --prod` in the folder.

---

### Option C — GitHub Pages (free, always-on)

1. Create a free account at **https://github.com**.
2. Click **New repository**, name it `moodbloom`, set it to **Public**, click **Create**.
3. On your computer, open a terminal in the `MoodTracker` folder and run:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/moodbloom.git
git push -u origin main
```

4. In the GitHub repo go to **Settings → Pages → Source → Deploy from branch → main / (root)**.
5. After ~1 minute your site is at `https://YOUR_USERNAME.github.io/moodbloom`.

---

## Part 4 — Verify Cross-Device Sync

1. Open the app in **Chrome on your computer**.
2. Open the app in **Safari on your phone** (use the Netlify/Vercel URL).
3. Log a mood entry on the computer.
4. Switch to the **History** tab on your phone — the entry should appear.
5. Delete the entry on the phone — it disappears on the computer too (after refreshing).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Yellow setup banner still showing | Check `js/config.js` — make sure the URL and key are inside quotes and the file is saved |
| "Could not save entry" toast | Open browser DevTools → Console for the exact Supabase error. Usually an RLS policy issue — re-run the SQL from Step 3 |
| Entries not showing on second device | Make sure both devices are using the same deployed URL, not `localhost` |
| Netlify says "Page not found" | Make sure you dragged the **folder**, not individual files |
| CORS error in console | Your Supabase project URL in `config.js` might have a trailing slash — remove it |

---

## Security Note

The `anon` key in `config.js` is **safe to commit and expose publicly**. It is specifically
designed by Supabase for browser use and only has the permissions you granted via the RLS
policies above (read, insert, delete — nothing else). Your database password is never in the code.
