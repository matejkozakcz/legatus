

## Problem: Sync trigger overwrites manual edits

The `sync_activity_from_meetings` database trigger fires on every meeting INSERT/UPDATE/DELETE and overwrites these `activity_records` columns:
- `fsa_actual` (FSA Proběhlé)
- `ser_actual` (SER Proběhlé)  
- `bj`, `bj_fsa_actual`, `bj_ser_actual`
- `ref_actual`

But users also manually edit `fsa_actual`, `ser_actual`, `poh_actual`, `ref_actual`, `bj` in "Moje aktivity". The trigger resets their manual values.

### Solution

Split the data into two categories:
1. **Manually edited** (planned + some actuals): `fsa_planned`, `ser_planned`, `poh_planned`, `ref_planned`, `por_planned`, `por_actual`, `kl_fsa_actual`, `dop_kl_actual` — these stay user-editable, trigger never touches them
2. **Auto-synced from meetings**: `fsa_actual`, `ser_actual`, `bj`, `bj_fsa_actual`, `bj_ser_actual`, `ref_actual` — these are computed from `client_meetings` and should be **read-only** in MojeAktivity

### Changes

**1. Update sync trigger** to also count `poh_actual` (POH meetings) from `client_meetings`:
```sql
COUNT(*) FILTER (WHERE meeting_type = 'POH' AND NOT cancelled) → poh_actual
```

**2. Mark auto-synced columns as read-only in MojeAktivity UI**:
- `fsa_actual`, `ser_actual`, `poh_actual`, `ref_actual`, `bj`, `bj_fsa_actual`, `bj_ser_actual` — display as non-editable (no +/- buttons, greyed out styling)
- Desktop table: these cells show value without edit controls
- Mobile counters: remove increment/decrement for these fields

**3. Files to edit**:
- **Migration SQL** — update `sync_activity_from_meetings` to also sync `poh_actual`
- `src/pages/MojeAktivity.tsx` — make auto-synced columns read-only in both desktop and mobile views

