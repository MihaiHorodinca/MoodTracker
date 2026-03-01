# MoodFlare 🔥

> **Feel it. Log it. Understand it.**

A lightweight mood tracking web app with a dark orange aesthetic. Log daily moods, track intensity, and review your history with filters and a chart.

**Live site:** [moodflare.netlify.app](https://moodflare.netlify.app)

---

## Features

- **Log Mood** — pick from 12 preset moods or write a custom one, set intensity (1–10), add notes
- **History** — searchable, filterable list of all entries grouped by date
  - Search by name or ID
  - Filter by date range: All time / Today / This week / This month
  - Filter by mood with scrollable pills
  - Clear all filters in one click
- **Chart** — average intensity over time (orange line chart)
- **Stats** — total entries, top mood, current streak
- **Realtime sync** — data stored in Supabase, syncs across devices

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML / CSS / JavaScript |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| Charts | [Chart.js 4](https://www.chartjs.org) |
| Font | [Nunito](https://fonts.google.com/specimen/Nunito) via Google Fonts |
| Hosting | [Netlify](https://netlify.com) (auto-deploy from `main`) |

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/MihaiHorodinca/MoodTracker.git
cd MoodTracker
```

### 2. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Run this SQL in the Supabase SQL editor to create the entries table:

```sql
create table entries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  mood_label  text not null,
  mood_emoji  text not null,
  intensity   int  not null check (intensity between 1 and 10),
  description text,
  timestamp   timestamptz default now()
);

-- Allow public reads and inserts (no auth required)
alter table entries enable row level security;
create policy "Public read"   on entries for select using (true);
create policy "Public insert" on entries for insert with check (true);
create policy "Public delete" on entries for delete using (true);
```

3. Copy your project URL and anon key from **Project Settings → API**
4. Open `js/config.js` and fill them in:

```js
const CONFIG = {
  SUPABASE_URL:      'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key',
};
```

### 3. Run locally

No build step needed — just open `index.html` in a browser, or use any static server:

```bash
npx serve .
```

---

## Deployment

### Netlify (current)

The repo is connected to Netlify. Every push to `main` redeploys automatically in ~30 seconds.

- **Publish directory:** `.` (root)
- **Build command:** none (static site)
- Config is in [`netlify.toml`](./netlify.toml)

### Vercel

A [`vercel.json`](./vercel.json) config is also included if you prefer Vercel. Import the repo at [vercel.com/new](https://vercel.com/new) — no extra configuration needed.

---

## Project Structure

```
MoodTracker/
├── index.html          # App shell and all markup
├── css/
│   └── styles.css      # All styles (dark orange theme)
├── js/
│   ├── app.js          # App logic, Supabase calls, filters, chart
│   └── config.js       # Supabase credentials (not committed)
├── netlify.toml        # Netlify deploy config
├── vercel.json         # Vercel deploy config
└── DEPLOYMENT.md       # Detailed deployment guide
```

---

## Color Palette

| Token | Value | Use |
|---|---|---|
| Background | `#0a0a0a` | Page background |
| Surface | `#141414` | Cards |
| Primary | `#f97316` | Orange accent, buttons, active states |
| Text | `#f0f0f0` | Body text |
| Muted | `#555555` | Placeholders, labels |
