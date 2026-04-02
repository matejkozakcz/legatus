

# Legatus — Activity Tracking & Team Management App

A multi-user SaaS application in Czech for network marketing organizations, with role-based hierarchy (Vedoucí → Garant → Nováček), activity tracking, and team management.

---

## Phase 1: Foundation & Design System

- Set up brand colors (Coral `#fc7c71`, Teal `#00abbd`, Deep teal `#00555f`, Background `#dde8ea`), typography (Poppins + Open Sans via Google Fonts), border radii, and card shadows as CSS variables
- Copy all uploaded assets (logos, team member photos) into the project

## Phase 2: Authentication & Login Page

- Build the login page matching the mockup: deep-teal background with diagonal `#dde8ea` parallelogram band via `clip-path`, centered white card with Legatus logo, email + password inputs, coral "Přihlásit se" button, copyright footer
- Connect Supabase auth (email/password only, no public registration)
- Auth context with protected routes redirecting unauthenticated users to login

## Phase 3: Database Schema & Backend

- Create `profiles` table with role, vedouci_id, garant_id, avatar_url, is_active fields + auto-create trigger on auth.users
- Create `activity_records` table with all activity columns (FSA, POR, KL, SER, POH, REF, DOP KL, BJ) keyed by user_id + week_start
- Set up RLS policies: users see own data, Garant sees their Nováčci, Vedoucí sees full subtree
- Create Supabase Edge Function `create-user` for admin user creation (service role)

## Phase 4: Navigation Sidebar

- Dark deep-teal sidebar with Legatus logo at top
- Nav items: Dashboard, Moje aktivity, Správa týmu (hidden for Nováček)
- Footer: user avatar, name, role badge, "Odhlásit" button
- Responsive: collapses on mobile

## Phase 5: Dashboard (`/dashboard`)

- **Moje statistika** section: time filter pills (Tento týden / Minulý týden / Tento měsíc) + date range picker, 4 stat cards (Analýzy, Pohovory, Poradka, Doporučení) with actual/planned, progress bars, color-coded accents, "Zobrazit detailní statistiku →" link
- **Moje struktura** section: org chart tree showing the user's team hierarchy with avatars, names, role badges, and SVG connector lines

## Phase 6: Moje aktivity (`/aktivity`)

- Same 4 stat cards with month-default time filter
- Weekly activity table for current month: editable number inputs for current week, read-only for past weeks, Czech date range labels, summary row with column sums
- Auto-save on blur (debounced 500ms) via upsert, React Query cache invalidation

## Phase 7: Správa týmu (`/tym`)

- **Seznam tab**: member cards/table with avatar, name, role badge, assigned Vedoucí/Garant, action buttons (Zobrazit aktivity, Upravit, Deaktivovat, Povýšit)
- **Org chart tab**: full team tree with clickable nodes
- **Přidat člena modal**: name, email, auto-assigned role (Nováček), Garant/Vedoucí selection based on creator's role, calls Edge Function, shows generated password
- **Upravit člena modal**: edit name, avatar, read-only role with promotion button
- **Deaktivovat dialog**: confirmation with soft-delete
- **Member activity view** (`/tym/[userId]/aktivity`): read-only version of Moje aktivity with back button

## Phase 8: Polish & Real-time

- Supabase Realtime subscription on activity_records for live team updates
- Toast notifications (deep-teal, pill-shaped, bottom-center)
- Loading skeletons on all async components
- Empty states with descriptive Czech text
- Deactivated users blocked from login and excluded from all views
- Czech date formatting with date-fns cs locale, weeks starting Monday

