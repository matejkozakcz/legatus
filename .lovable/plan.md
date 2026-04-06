

# Rozlišení „Naplánováno na týden" vs „Nově domluveno tento týden"

## Problem
Aktuálně dashboard zobrazuje `planned` = celkový počet schůzek v období a `actual` = schůzky s datem ≤ dnes. Nerozlišuje se, jestli byla schůzka **domluvena** tento týden (nově vytvořena) nebo jen **naplánována na** tento týden (datum schůzky padne do týdne).

## Řešení

### Dva koncepty
1. **Na tento týden** — schůzky kde `date` je v rozmezí aktuálního týdne. Z toho: kolik už proběhlo (`date <= today`) vs kolik je celkem.
2. **Nově domluveno** — schůzky kde `created_at` padne do aktuálního týdne (bez ohledu na datum schůzky). Samostatná karta.

### Změny v `Dashboard.tsx`

**Query**: Přidat `created_at` do selectu v obou queries (desktop + mobile).

**`computeStats`**: Zůstane beze změny — už počítá planned (celkem v období) a actual (date ≤ today) správně.

**Nová funkce `computeNewlyArranged`**: Spočítá schůzky kde `created_at` je v daném týdnu, seskupené podle typu (FSA, SER, POH).

**Mobile UI**:
- Stávající 2×3 grid karet zůstane — zobrazuje „proběhlých / naplánovaných na týden"
- Přidá se nová karta pod grid: **„Nově domluveno tento týden"** se třemi čísly: Analýzy, Servisy, Pohovory

**Desktop UI**:
- StatCardy zůstanou (planned/actual per period)
- Přidá se nový řádek karet „Nově domluveno" pod stávající StatCardy

### Změny v `MojeAktivity.tsx`
- Mobilní view: přidat pod existující karty i read-only kartu „Nově domluveno" se stejnou logikou (query na `created_at` v aktuálním týdnu)

## Technické kroky

1. **Dashboard.tsx** — rozšířit select o `created_at`, přidat `computeNewlyArranged()`, přidat UI kartu „Nově domluveno" na mobilu i desktopu
2. **Změna sublabel** — u mobilních StatCardů změnit popisek na „proběhlých / na tento týden" aby bylo jasné co je co

## Rozsah
- 1 soubor: `src/pages/Dashboard.tsx`
- Žádné DB změny — `created_at` už existuje v `client_meetings`

