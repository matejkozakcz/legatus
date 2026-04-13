

## Zobrazení BJ v org chartu — plán

### Co se změní

**NodeCard** v `OrgChart.tsx` dostane nový řádek pod jméno zobrazující BJ hodnotu:
- **Nováček / Získatel / Garant** → „X BJ" (osobní BJ = suma `podepsane_bj` z `client_meetings` za zvolené produkční období)
- **BV / Vedoucí** → „X BJ tým" (suma osobních BJ všech lidí v jejich struktuře + vlastní BJ, za zvolené období)

Progress bar zůstane beze změny.

### Technické kroky

1. **OrgChart props** — přidat `periodStart: string` a `periodEnd: string` (ISO date) pro filtrování období.

2. **Dotaz na BJ data** — upravit stávající query `org_cumulative_bj` a `org_meeting_bj` tak, aby filtrovaly `.gte("date", periodStart).lte("date", periodEnd)` (místo all-time). Query key rozšířit o period.

3. **Výpočet osobního BJ** — pro každého uživatele suma `podepsane_bj` z `client_meetings` za období.

4. **Výpočet týmového BJ** — pro BV/Vedoucí rekurzivně projít `childrenMap`, sečíst osobní BJ všech potomků + vlastní.

5. **Nová prop `bjMap: Map<string, {value: number, isTeam: boolean}>`** předaná do `NodeCard` — zobrazí se jako text pod jménem: malé písmo, barva role, formát `"1 250 BJ"` / `"1 250 BJ tým"`.

6. **Dashboard.tsx** — předat `periodStart` a `periodEnd` z existujícího `periodRange` (z `ProductionMonthPicker`) do `<OrgChart>`.

### Dotčené soubory
- `src/components/OrgChart.tsx` — nové props, úprava queries, BJ výpočet, NodeCard zobrazení
- `src/pages/Dashboard.tsx` — předání period props

