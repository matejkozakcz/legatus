## Plán: user_goals refactor

Rozsah je velký (~4100 řádků dotčeno). Navrhuji rozdělit na 4 kroky a každý ověřit, než pokračuju dál — jinak hrozí, že rozbiju Dashboard pro všechny role najednou.

### Krok 1 — Základ (tato iterace)
1. **`src/hooks/useUserGoals.ts`** — nový hook (load + computed actuals podle metric_key).
2. **`src/lib/goalMetrics.ts`** — centrální definice metrik: `METRIC_DEFS = { personal_bj: { label, periodic, peopleGoal, computeActual(...) }, ... }`. Sem patří všech 12 metrik z tabulky.
3. **`src/components/UserGoalsModal.tsx`** — nová komponenta (2 záložky periodické/trvalé, chips, scope/count_type pro people goals, upsert/delete do `user_goals`). Respektuje `allowed_metrics` z `goal_configuration` (kromě canEdit=admin).
4. **`GoalsSection.tsx`** — přidat prop `wrap?: boolean` pro 2-řadý layout když gauges > 3.

### Krok 2 — Dashboard přepis
- Nahradit `vedouci_goals` query za `useUserGoals(user.id, currentPeriodKey)`.
- `getGoalValue/getGoalMax` přepsat tak, aby četly z `user_goals` a používaly `goalMetrics.computeActual`.
- Otevřít `UserGoalsModal` místo `VedouciGoalsModal`. Import `VedouciGoalsModal` zakomentovat.
- Renderovat všechny aktivní gauges (bez limitu 2), `wrap` když > 3.

### Krok 3 — Admin
- `UserDetailModal.tsx`: nová sekce/záložka „Cíle" s period dropdownem, seznamem metrik (inputs + scope/count_type), tlačítka Uložit periodické / Uložit trvalé. Zobrazit existující cíle s `set_by` jménem a datem. Ukládá `set_by = auth.uid()`.

### Krok 4 — GoalConfiguratorTab
- Odstranit sekci výběru cílů vedoucího.
- Přidat `ser_bj_weekly`, `lidi_na_info_weekly` do `BASIC_GOALS` + `GOAL_LABELS`.
- Pod `allow_custom_goals` toggle: checkboxy `allowed_metrics` (zobrazí se jen když toggle on). Uložit do `goal_configuration[role].allowed_metrics`.

### Co NEMĚNIT
- `vedouci_goals` tabulka ani její RLS (zachovat pro rollback).
- `VedouciGoalsModal.tsx` v kódu zůstává, jen se nepoužívá.
- DB migrace — `user_goals` už existuje.

### Otázka před startem
Chceš, abych udělal **všechny 4 kroky najednou v této odpovědi** (riziko: rozbitý Dashboard, dlouhá iterace na opravy), nebo **začneme krokem 1+2** (nový hook + modal + Dashboard) a admin/configurator přijdou v dalším promptu po ověření?