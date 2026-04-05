

# Dashboard data z client_meetings

## Problém
Dashboard aktuálně čte data z tabulky `activity_records`, která je odvozená (syncovaná triggerem). Uživatel chce, aby jediným zdrojem dat byly `client_meetings` (Byznys případy).

## Nový datový model

Místo čtení z `activity_records` bude Dashboard počítat vše přímo z `client_meetings`:

| Metrika | Actual (proběhlé) | Planned (naplánované) |
|---------|------|---------|
| Analýzy (FSA) | COUNT kde `meeting_type='FSA'`, `NOT cancelled`, `date < today` | COUNT kde `meeting_type='FSA'`, `NOT cancelled`, `date >= today` |
| Pohovory (POH) | COUNT kde `meeting_type='POH'`, `NOT cancelled`, `date < today` | COUNT kde `meeting_type='POH'`, `NOT cancelled`, `date >= today` |
| Servisy (SER) | COUNT kde `meeting_type='SER'`, `NOT cancelled`, `date < today` | COUNT kde `meeting_type='SER'`, `NOT cancelled`, `date >= today` |
| Poradenství (POR) | COUNT kde `meeting_type='POR'`, `NOT cancelled`, `date < today` | COUNT kde `meeting_type='POR'`, `NOT cancelled`, `date >= today` |
| Doporučení | SUM(doporuceni_fsa + doporuceni_poradenstvi + doporuceni_pohovor) z proběhlých | SUM z naplánovaných |
| BJ | SUM(podepsane_bj) z proběhlých, NOT cancelled | — |

## Změny

### 1. Dashboard.tsx — Desktop stats (řádky 345-369)
- Nahradit query na `activity_records` za query na `client_meetings`
- Filtrovat podle `user_id`, date range, a počítat COUNT/SUM podle meeting_type a date vs. today
- Odstranit `activity_records` dependency pro statistiky

### 2. Dashboard.tsx — Mobile stats (řádky 493-560)
- Nahradit `activity_records` query za `client_meetings` query filtrovanou na týden
- Odebrat upsert mutaci do `activity_records` (mobilní +/- tlačítka v God Mode zůstávají, ale budou editovat `client_meetings` nebo se odeberou, protože data se zadávají přes formulář schůzek)
- Mobilní karty budou read-only (actual/planned se počítají z meetings)

### 3. Dashboard.tsx — BJ gauges
- `personalMonthlyBj`: SUM(podepsane_bj) z `client_meetings` WHERE user_id = me, NOT cancelled, date v production period
- `vedouciMonthlyBj`: SUM(podepsane_bj) z `client_meetings` WHERE NOT cancelled, date v production period (all visible via RLS)
- `totalBjAllTime`: SUM(podepsane_bj) z `client_meetings` WHERE user_id = me, NOT cancelled

### 4. Mobilní +/- tlačítka
Protože data se nyní počítají z meetings, mobilní +/- tlačítka (God Mode) pro ruční editaci activity_records ztratí smysl. Odeberou se. Mobilní stat karty budou čistě zobrazovací.

### 5. Přidat Poradenství do stat karet
Aktuálně Dashboard zobrazuje: Analýzy, Pohovory, Poradka (SER), Doporučení. Po refaktoru přidám i POR jako samostatnou kartu "Poradenství", aby odpovídala struktuře v Byznys případech.

## Soubory k úpravě
- `src/pages/Dashboard.tsx` — hlavní změna, přepojení všech queries

## Co se NEMĚNÍ
- Tabulka `activity_records` zůstane v DB (nebude smazána)
- `sync_activity_from_meetings` trigger zůstane (pro zpětnou kompatibilitu)
- Stránka ObchodniPripady, Kalendar — beze změn
- BJ goal editace (Vedoucí) — zůstává stejná

