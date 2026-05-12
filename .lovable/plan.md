## Plán: BJ Funnel (Plánované → Rozpracované → Realizované)

### Definice (potvrzené)

| Krok | Vzorec |
|---|---|
| **Plánované BJ** | `SUM(potencial_bj)` ze všech FSA/SER schůzek v období, kde `cancelled=false` (i budoucí, i proběhlé) |
| **Rozpracované BJ** | `SUM(bj)` ze schůzek, kde `outcome_recorded=true` AND `vizi_spoluprace=true` AND `podepsane_bj=0` AND `cancelled=false` (klient řekl ANO, ale ještě nepodepsal) |
| **Realizované BJ** | `SUM(podepsane_bj)` ze všech schůzek v období (to už dnes plníme z Obchodních případů) |

### Krok 1 — Feature flag (DB + admin UI)

1. **Migrace**: přidat sloupec `org_units.show_bj_funnel boolean DEFAULT false`.
2. **Admin UI** (`WorkspaceDetailModal.tsx`): toggle „Zobrazit BJ funnel (Plánované / Rozpracované / Realizované)" v sekci Nastavení workspace.
3. **Hook** `useWorkspaceSettings.ts` (nový) — vrací `{ showBjFunnel: boolean }` pro aktuálního usera (joinem na `profiles.org_unit_id → org_units`).

### Krok 2 — Centrální výpočet

**`src/lib/bjFunnel.ts`** (nový) — jediný zdroj pravdy:
```ts
export interface BjFunnel { planned: number; inProgress: number; realized: number; }
export function computeBjFunnel(meetings: ClientMeetingRow[]): BjFunnel
```
Použijí ho Dashboard, MemberActivity, ObchodniPripady i export.

### Krok 3 — UI komponenta

**`src/components/BjFunnelCard.tsx`** — 3 StatCardy vedle sebe se šipkami mezi nimi (→), v Legatus designu:
- Plánované: teal #00abbd label, deep teal číslo
- Rozpracované: teal #00abbd
- Realizované: coral #fc7c71 (cíl funnelu = realizace)

Pod kartami volitelně mini conversion rate „Realizováno z plánovaných: 42 %".

### Krok 4 — Integrace do 4 míst

1. **Dashboard.tsx** — když `showBjFunnel`, nahradit jeden BJ StatCard `<BjFunnelCard />`.
2. **MemberDetailModal → záložka Statistiky** — totéž (per-člen).
3. **ObchodniPripady.tsx** — funnel v hlavičce nad tabulkou case-ů.
4. **exportPdf.ts** — pokud `showBjFunnel`, přidat 3-sloupcovou sekci „BJ Funnel" pod stávající součty.

### Co NEMĚNIT
- Stávající `bj` sloupec a všechny dosavadní výpočty (Dashboard, gauges, cíle) zůstávají.
- Když je flag OFF, vše vypadá přesně jako dnes.
- `vedouci_goals` ani `user_goals` se neupravují — funnel je pouze zobrazení, ne nový cíl.

### Otázka před startem
Mám pokračovat **rovnou implementací všech 4 kroků** (cca 6–8 souborů, jeden velký commit), nebo to **rozdělit na 2 iterace** (1+2+3 = základ a zobrazení na Dashboardu, pak 4 = ostatní místa po ověření)?
