# Dashboard Upgrade: Headquarters Productivity System

## ⚠️ Architecture adaptation note (read first)

The plan below was written assuming a **Next.js app on Vercel with a relational Supabase
schema** (a `tasks`/`todos` table, RLS policies, per-row columns, foreign keys). That is
not what this repo is.

**What's actually here:**
- Static HTML pages (`index.html`, `main.html`, `health.html`, `po-water.html`,
  `finance.html`, `gym.html`) with vanilla JS. No build step, no framework, no `package.json`.
- "Tasks" are called **goals** and live in `localStorage` as JSON arrays keyed per day
  (`goals:2026-07-11` → `[{text, done}, ...]`). No `id` field currently exists on a goal.
- Supabase is used only as a **dumb key/value blob store**: one table, `app_state(key, data jsonb, updated_at)`.
  `sync.js` pushes/pulls the *entire* matching slice of `localStorage` under an `appKey`. There
  are no per-entity rows, no relational queries, and no RLS/auth pattern to match — there's no
  auth at all (single shared dashboard).
- There is no existing 8am–12am day-tracker timeline component (Phase 3 assumed one existed).

**Decision (confirmed with user 2026-07-11):** adapt the plan to the real architecture rather
than rebuild onto Next.js/relational Supabase. Concretely:

- No SQL migration. The "schema" becomes a shared JS data layer (`hq-data.js`) that defines
  the new entities (buckets, projects, notes, journal entries, bottlenecks) as `localStorage`
  collections under a `hq:` key prefix, plus helpers to normalize existing goal objects with
  the new fields (`importance`, `urgency`, `state`, `bucket`, `projectId`, `minutes`,
  `startTime`, `durationMinutes`, and a new `id`).
- Cross-device sync for the new data reuses the existing `initCloudSync` blob mechanism
  (`sync.js`), registered separately under `appKey: 'hq-data'` / `syncedPrefixes: ['hq:']`,
  so it doesn't disturb the existing `goals` sync.
- "Hard context separation" (buckets) and "auto-sorted queue" (Eisenhower) become client-side
  filtering/sorting over these JSON collections — no server-side RLS needed since there's no
  per-user auth.
- Phase 3 (time blocking) will need to build a day-tracker timeline from scratch since none
  exists yet — flagged for discussion when we reach that phase.

Each phase below still stops for approval before the next one starts. The phase numbering and
feature intent are unchanged from the original request; only the implementation substrate
(localStorage + blob sync instead of relational SQL) is different.

---

## Original plan (as given by user)

Your existing stack: Next.js dashboard → Vercel, Supabase backend. These prompts bolt the 10
Notion "Headquarters" methods onto your existing to-do list instead of rebuilding anything.

### PROMPT 0 — Schema migration

Look at my existing Supabase schema for this dashboard (check the SQL files in this repo and
how the todo/tasks table is queried in the code). Then generate a single SQL migration file
called `upgrade_headquarters.sql`... *(superseded — see adaptation note above; no SQL files or
relational tasks table exist in this repo)*.

### PROMPT 1 — Eisenhower Matrix + auto-sorted task queue
Three inline pill selectors per task (Importance / Urgency / State). "Order" view auto-sorts by
Eisenhower priority, habits at bottom, instant client-side re-sort + persist. Mobile: collapse
behind "⋯" under 640px. Keep existing add/check/prioritize/push-to-tomorrow working.

### PROMPT 2 — Time blocking on the day tracker
Tasks get `start_time`/`duration_minutes`, render as blocks on an 8am–12am day tracker,
drag-to-move desktop (15-min snap), tap-to-edit mobile, overlaps side by side.

### PROMPT 3 — Life Buckets + Projects
Bucket tags on tasks/notes with a filtered bucket view. Projects panel grouped by status
(Deadline/Ongoing/Done), project page with tasks/notes/bottlenecks + "create task from fix."
Floating Quick Note button (content/bucket/project/topic), zero navigation.

### PROMPT 4 — Time tracking + Move the Needle
Inline minutes prompt on check-off, pre-filled from duration. Time Tracking page: minutes per
bucket/project, week/month. Move the Needle page: completed `move_the_needle` tasks by week.

### PROMPT 5 — Flow limit + Eat the Frog
Amber banner if >2 flow tasks same day, one-tap push lowest-priority flow task to next week.
🐸 badge on important+urgent flow tasks.

### PROMPT 6 — Dynamic journaling
Daily/Weekly/Monthly journal entries. Weekly Review auto-embeds that week's completed tasks
grouped by bucket with move-the-needle flags, plus free-text reflection prompts.

### PROMPT 7 — Habits, Routine button, Open Loops
Habit Tracker calendar grid + streaks for `urgency=habit` tasks. Configurable "Routine" button
generates template tasks for today in one tap. Open Loops page: unfinished projects + tasks
older than 7 days.

### Run order & sanity checks
1. Phase 0 → data layer → verify no existing pages broken.
2. Phases 1–7 in order, one at a time, verify on Vercel/GitHub Pages + phone after each push.
3. If UI breaks on mobile: fix responsive layout under 640px without changing desktop.
4. If a query/read fails: check keys/shape against the actual data layer, don't change the
   data layer casually.

### Two non-negotiable principles
1. **Zero logging friction** — every new input is one tap or pre-filled. No forms, no
   navigation to log something.
2. **Hard context separation** — filtering into a bucket must show zero cross-bucket bleed.

---

## Phase status

- [x] Phase 0 — Data layer foundation (`hq-data.js`) created. Not yet wired into any page.
- [x] Phase 1 — Life buckets + workspace filtering, projects, quick notes. Wired into `main.html`. Pushed 2026-07-11. **Not yet verified in a real browser** (no Node/Python/browser-automation tooling available in this environment) — verified by static cross-check (every `getElementById` target exists, no duplicate ids, balanced braces/parens, full manual re-read of the new code) instead. Please open the live page (or `main.html` locally) and sanity-check before Phase 2.
- [x] Phase 2 — Eisenhower Matrix pill selectors (Importance/Urgency/State) in a
      collapsible meta row (behind "..." under 640px), plus a Manual/Order view
      toggle on Today that auto-sorts by Eisenhower rank and persists. Pushed
      2026-07-11. Not yet verified in a real browser (see Phase 1 note).
- [x] Phase 3 — Time blocking. Built a new "Day Tracker" vertical timeline
      (8am-12am) from scratch, positioned by each task's start time +
      duration (new inline controls in the row meta section), overlapping
      tasks side by side. Deliberately scoped out drag-to-move — pixel
      math I can't visually verify without a browser — tapping a block
      toggles it done instead, editing time/duration stays in the row's
      own controls. Pushed 2026-07-11. Not yet verified in a real browser.
- [x] Phase 4 — Time tracking + Move the Needle. Required a prerequisite fix
      first: rollover() was deleting each day's whole task list (including
      completed tasks) once it rolled to the next day, leaving nothing to
      compute history from. Added hq:completedLog (archived by rollover
      before it deletes a day, capped ~13 months) as the historical source.
      On check-off: silently uses durationMinutes if set, otherwise a
      one-tap minute-chip toast (15/30/60/90m) - never a form. New Time
      Tracking section (minutes by bucket/project, this week + month, bar
      style) and Move the Needle section (move_the_needle completions
      grouped by week with bucket/project tags). Pushed 2026-07-12. Not yet
      verified in a real browser.
- [ ] Phase 5 — Flow limit + Eat the Frog
- [ ] Phase 6 — Dynamic journaling
- [ ] Phase 7 — Habits, Routine button, Open Loops
