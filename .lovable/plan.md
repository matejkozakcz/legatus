

## Plan: Karta "Stav byznysu" s tachometry na Dashboardu

### Přehled

Na desktop Dashboardu se vedle "Moje struktura" objeví nová karta **Stav byznysu** (2/5 šířky vlevo, struktura 3/5 vpravo). Obsahuje dva polokruhové tachometry, jejichž obsah závisí na roli uživatele. Pro Vedoucího přibude nastavitelný měsíční cíl BJ (nový sloupec v DB).

### Databáze

**Migrace**: Přidat sloupec `monthly_bj_goal` (integer, default 0, nullable) do tabulky `profiles`. Vedoucí si ho bude moci nastavit v dashboardu.

### Nová komponenta: `src/components/GaugeIndicator.tsx`

SVG polokruhový tachometr (arc 180°). Props: `value`, `max`, `label`, `sublabel`. Vyplnění oblouku = `value/max`. Barvy: teal gradient pro výplň, šedá pro pozadí. Uprostřed velké číslo `value` a pod ním `z max`.

Placeholder varianta (pro Nováčka): šedý oblouk, text "—".

### Změny v `src/pages/Dashboard.tsx` (desktop sekce)

**1. Layout**: Sekce "Moje struktura" se obalí do flexboxu s kartou "Stav byznysu":

```text
┌─────────────┬───────────────────┐
│ Stav byznysu│   Moje struktura  │
│   (40%)     │      (60%)        │
│ [Gauge 1]   │                   │
│ [Gauge 2]   │    OrgChart       │
└─────────────┴───────────────────┘
```

**2. Data queries per role**:

| Role | Gauge 1 | Gauge 2 |
|------|---------|---------|
| Nováček | Placeholder | Placeholder |
| Získatel | BJ progress (cumul. x / 1000) — tachometr | Velký text "X z 1 000 BJ" (bez tachometru) |
| Garant | Přímí podřízení (x / 3) — query `profiles` kde `garant_id = me` | Lidé ve struktuře (x / 10) — recursive count |
| Vedoucí | BJ tento měsíc vs. `monthly_bj_goal` — sum `bj` z `activity_records` za production period | Velký text: aktuální BJ / plán (stejná data, jiný formát) |

**3. Vedoucí goal edit**: Malé editovací tlačítko u 1. tachometru → inline input pro nastavení `monthly_bj_goal` → upsert do `profiles`.

**4. Queries**:
- Získatel: reuse `allBjData` query (cumulative BJ all-time), move from mobile-only
- Garant: nový query na `profiles` count kde `garant_id = user.id` + recursive subtree count
- Vedoucí: nový query na `activity_records` sum `bj` za aktuální production period pro celý subtree

### Soubory

| Soubor | Akce |
|--------|------|
| `supabase/migrations/...` | ADD `monthly_bj_goal integer default 0` to profiles |
| `src/components/GaugeIndicator.tsx` | CREATE — SVG tachometr |
| `src/pages/Dashboard.tsx` | EDIT — přidat kartu Stav byznysu, layout 2/5+3/5, role-based obsah |

### Technické detaily

- SVG arc: `stroke-dasharray` + `stroke-dashoffset` na `<circle>` s `transform: rotate` pro polokruh
- Garant subtree count: query all profiles where `vedouci_id` matches or recursively under garant — simplified via counting profiles where `garant_id = me` (direct) and a broader query for structure
- Production period dates from `getProductionPeriodStart/End`
- RLS already allows vedoucí to read subtree activity_records

