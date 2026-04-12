# Zapracování Nováčka — Onboarding Task System

## Summary

Nový systém "Zapracování" pro Nováčky: databázová tabulka úkolů s deadliny, šablonový systém pro Vedoucí/BV, progress tracking, notifikace, a upravené UI pro mobilní i desktopové rozhraní Nováčka.

---

## 1. Database

### New table: `onboarding_tasks`

| Column       | Type                      | Notes                             |
| ------------ | ------------------------- | --------------------------------- |
| id           | uuid PK                   |                                   |
| novacek_id   | uuid NOT NULL             | FK-like to profiles.id            |
| title        | text NOT NULL             | e.g. "Osobní databáze - 100 lidí" |
| description  | text                      | Optional note/link field          |
| sort_order   | integer                   | Chronological ordering            |
| deadline     | date                      | Set by Vedoucí/BV                 |
| completed    | boolean DEFAULT false     | Nováček confirms                  |
| completed_at | timestamptz               | Auto-set on completion            |
| created_by   | uuid NOT NULL             | Who assigned it                   |
| created_at   | timestamptz DEFAULT now() |                                   |
| updated_at   | timestamptz DEFAULT now() |                                   |

**RLS policies:**

- Nováček can SELECT own tasks (`novacek_id = auth.uid()`)
- Nováček can UPDATE own tasks (only `completed`, `completed_at`, `description` fields — handled in app logic)
- Vedoucí/BV can SELECT/INSERT/UPDATE/DELETE tasks for users in their subtree
- Garant can SELECT tasks for their novacci (read-only)

### New table: `onboarding_templates`

| Column     | Type                      | Notes                                   |
| ---------- | ------------------------- | --------------------------------------- |
| id         | uuid PK                   |                                         |
| name       | text NOT NULL             | Template name                           |
| items      | jsonb NOT NULL            | Array of {title, default_deadline_days} |
| created_by | uuid NOT NULL             |                                         |
| created_at | timestamptz DEFAULT now() |                                         |

**RLS:** Admin + Vedoucí/BV can manage templates.

### Enable realtime on `onboarding_tasks`:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.onboarding_tasks;
```

---

## 2. Navigation Changes

### Sidebar (`AppSidebar.tsx`)

- For `novacek` role: hide "Správa týmu", show only Dashboard, Kalendář, Můj byznys (already there)
- Add "Zapracování" nav item for Nováček (icon: `GraduationCap` or `ClipboardList`)

### Mobile Bottom Nav (`MobileBottomNav.tsx`)

- Current: Nováček sees "Obchod" (left) + "Schůzky" (right)
- Change to: **"Obchod"** (left) + **"Zapracování"** (right)
- New route: `/zapracovani`

---

## 3. New Page: Zapracování (`src/pages/Zapracovani.tsx`)

### Nováček View (own tasks)

- Chronological list of tasks sorted by `sort_order`
- Each task shows: title, deadline date, status (pending/completed/overdue)
- Overdue tasks (past deadline, not completed) highlighted in coral
- Each task expandable to show/edit `description` (poznámka field)
- "Splnit" button to mark as completed
- Style consistent with existing app cards/lists

### Mobile layout

- Clean card-based list, similar to existing mobile stat cards
- Current/next task prominently shown at top

---

## 4. Dashboard Changes for Nováček

### Desktop: "Stav byznysu" card

- Replace placeholder gauges with a **horizontal progress bar**
- Shows: current next uncompleted task title, its deadline
- Progress bar: `% completed tasks / total tasks`
- Label: "Postup k pozici Získatele"

### Mobile: Same gradient card area

- Replace dual placeholder gauges with horizontal progress bar
- Current task + deadline displayed
- % completion shown

---

## 5. Vedoucí/BV Interface (in Správa týmu)

### In `MemberDetailModal` or new section for Nováček members:

- "Zapracování" tab showing task list for that Nováček
- Can add/edit/delete tasks, change deadlines, toggle completion
- "Použít šablonu" button to bulk-create tasks from a template
- Template management (create/edit templates) in same UI or Admin Dashboard

### Garant view:

- Same "Zapracování" tab but read-only (no edit/delete buttons)

---

## 6. Notifications

Three notification types added to the system:

| Type                        | Recipient           | Trigger                      |
| --------------------------- | ------------------- | ---------------------------- |
| `onboarding_new_task`       | Nováček             | New task assigned            |
| `onboarding_deadline_soon`  | Nováček             | 2 days before deadline       |
| `onboarding_overdue`        | Nováček             | Past deadline, not completed |
| `onboarding_task_completed` | Garant + BV/Vedoucí | Nováček marks task as done   |

Implementation: extend existing `check-reminders` edge function or create a new `check-onboarding` edge function that runs on schedule.

---

## 7. Files to Create/Modify

| File                                           | Action                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Migration SQL                                  | Create `onboarding_tasks` + `onboarding_templates` tables with RLS |
| `src/pages/Zapracovani.tsx`                    | New page — Nováček onboarding task view                            |
| `src/pages/Dashboard.tsx`                      | Replace Nováček gauges with progress bar                           |
| `src/components/AppSidebar.tsx`                | Add Zapracování for Nováček, hide Tým                              |
| `src/components/MobileBottomNav.tsx`           | Change right button for Nováček to Zapracování                     |
| `src/App.tsx`                                  | Add `/zapracovani` route                                           |
| `src/components/MemberDetailModal.tsx`         | Add Zapracování tab for viewing/managing Nováček tasks             |
| `supabase/functions/check-onboarding/index.ts` | Deadline/overdue notification checks                               |

---

## Technical Notes

- Nováček sidebar: no "Správa týmu" link (role check already partially in place, just needs tightening for `novacek`)
- Progress calculation: `completedTasks.length / totalTasks.length * 100`
- Template items stored as JSON array; when applied, creates individual rows in `onboarding_tasks` with calculated deadlines (today + default_deadline_days)
- Poznámka field = single text input per task (for links, notes etc.)
