

## Plan: Editable weekly stat cards on mobile Dashboard

### What changes

The mobile Dashboard will get a week navigator (moved from Moje aktivity concept) replacing the "Můj tým" card. The 4 stat cards (Analýzy, Pohovory, Poradka, Doporučení) will show **weekly** data and have +/- buttons on the right side for editing the "actual" values directly.

### File: `src/pages/Dashboard.tsx`

1. **Add mutation imports** — `useMutation`, `useQueryClient` from react-query, `addWeeks`, `isSameWeek` from date-fns, `ChevronLeft`, `ChevronRight` icons, `toast` from sonner.

2. **Add week navigation state** — `mobileWeekOffset` state (same pattern as MojeAktivity), compute `mobileWeekStart`, `mobileWeekEnd`, `mobileWeekStr`.

3. **Replace month queries with week query** — Instead of `monthRecords` (period range), fetch the single week's `activity_record` for the selected week. Add `localValues` state for optimistic updates.

4. **Add upsert mutation** — Same debounced upsert pattern as MojeAktivity to save changes to `activity_records`.

5. **Remove "Můj tým" card** — Delete the entire team card section (lines 342-395) and related queries (`teamMembers`, `pendingPromos`).

6. **Add week navigator UI** — Place it where "Můj tým" was (after the BJ card). Left/right chevron buttons + date range label, same style as MojeAktivity.

7. **Redesign MobileStatCard** — New layout: left side shows label + actual/planned numbers, right side has vertically stacked + and - buttons. The buttons call `handleMobileChange` to update the "actual" value for the current week.

8. **Update stat grid** — Cards now use `localValues` from the current week (e.g., `fsa_actual`, `fsa_planned`) instead of `monthStats`. Only editable when viewing the current week.

### Technical details

- The +/- buttons modify `fsa_actual`, `poh_actual`, `ser_actual`, `ref_actual` for the selected week
- Planned values remain read-only on Dashboard (edited in Moje aktivity)
- Debounced save (800ms) after each change, same as MojeAktivity
- `localValues` + `localValuesRef` pattern for instant UI feedback

