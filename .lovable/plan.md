# Call Party — plán

## Co to je
Nová stránka `/call-party` v levém menu (pod "Správa týmu"), dostupná všem rolím. Slouží k vedení záznamu z volání: kolik lidí se zavolalo, kolik se podařilo domluvit, a jaký typ schůzky byl domluven. Domluvené schůzky se automaticky propíšou do **client_meetings** (aby přispívaly do statistik aktivit) a do **cases** (jako nové obchodní případy).

## Otázky k vyjasnění před implementací

1. **Typy schůzek pro výsledek "Domluveno"** — Říkáš "Analýza, Servis, Pohovor, Nábor". Tedy `FSA`, `SER`, `POH`, `NAB`. Mám zahrnout i `POR` (Poradenství) a `INFO`, nebo jen ty 4?
2. **Datum domluvené schůzky** — Když se v Call Party označí "Domluveno → FSA", jakým datem má vzniknout záznam v `client_meetings`? Možnosti: (a) datum konání call party, (b) "neurčeno / TBD" a uživatel ji doplní později v Mém byznysu, (c) hned při zápisu nutné zadat datum a čas vedle dropdownu.
3. **Vznik obchodního případu** — Má se case založit pro **každého domluveného** klienta (jméno z prvního sloupce → `nazev_pripadu`)? A pro výsledky "Nezvedl/Nedomluveno" žádný case nevznikne?
4. **Cíle (počet zavolaných, počet domluvených …)** — Jsou cíle pouze informativní (zobrazení progressu v rámci session), nebo se mají někam propisovat / vyhodnocovat napříč obdobími?

## Datový model (Lovable Cloud)

Dvě nové tabulky:

**`call_party_sessions`**
- `id`, `user_id` (vlastník), `created_at`, `updated_at`
- `name` (text, např. "Pondělní call party")
- `date` (date)
- `goal_called`, `goal_meetings`, `goal_fsa`, `goal_poh`, `goal_nab`, `goal_ser` (int, cíle)
- `notes` (text, volitelné)

**`call_party_entries`**
- `id`, `session_id` (FK → sessions), `created_at`
- `client_name` (text)
- `outcome` (text: `nezvedl` | `nedomluveno` | `domluveno`)
- `meeting_type` (text, jen když outcome=domluveno: `FSA`/`SER`/`POH`/`NAB`)
- `created_meeting_id` (uuid, ref na `client_meetings.id` — null když nic nevzniklo)
- `created_case_id` (uuid, ref na `cases.id`)
- `sort_order` (int)

**RLS:** stejný vzor jako u `client_meetings`:
- Users manage own (auth.uid() = user_id na session, entries skrz session)
- Vedoucí vidí subtree (`is_in_vedouci_subtree`)
- Garant vidí svoje nováčky
- Admin all

## UI / UX

Routa `/call-party`, položka v sidebaru `AppSidebar.tsx` mezi "Správa týmu" a "Admin", ikona `PhoneCall` z lucide.

Stránka má dvě záložky (`Tabs` shadcn):

### Záložka 1 — Nová Call Party
- Hlavička: název session, datum
- Sekce **Cíle**: malá grid 2×3 s inputy (Zavolaných, Domluvených celkem, FSA, POH, NAB, SER) + živý progress vedle (např. `3 / 10`)
- Tabulka řádků (přidávané dynamicky tlačítkem "+ Přidat řádek"):
  - Sloupec 1: input `Jméno`
  - Sloupec 2: dropdown `Výsledek` (Nezvedl / Nedomluveno / Domluveno)
  - Když `Domluveno` → vedle se rozbalí dropdown typu schůzky (FSA/SER/POH/NAB)
  - Tlačítko smazat řádek
- Tlačítko **Uložit Call Party** (coral, jediné CTA na obrazovce)
  - Vytvoří session
  - Pro každý řádek `Domluveno` vytvoří `client_meetings` (typ podle dropdownu, `outcome_recorded=false`, `bj=0`) + případně `cases`
  - Po uložení reset formuláře nebo přepnutí na Historii s toastem

### Záložka 2 — Historie
- Seznam karet (jedna na session) seřazený od nejnovější:
  - Datum, název, krátký souhrn (X zavolaných, Y domluveno, plnění cílů barevně)
- Klik → modal **Detail Call Party**:
  - Read-only přehled cílů + tabulka řádků
  - Tlačítko **Upravit** → přepne modal do edit režimu (stejné pole jako záložka 1)
  - Tlačítko **Smazat** → confirm dialog
  - Pozn.: při editaci/mazání záznamů, které už vytvořily meeting/case, nutné rozhodnout co s nimi (viz otázka níže)

## Technické poznámky
- Soubory: `src/pages/CallParty.tsx`, `src/components/CallPartyEntryRow.tsx`, `src/components/CallPartyDetailModal.tsx`
- Routa v `src/App.tsx`, položka v `src/components/AppSidebar.tsx` (vždy viditelná)
- Migrace pro 2 tabulky + RLS + indexy `(user_id, date desc)` a `(session_id)`
- Reuse `MEETING_TYPE_COLORS` a `meetingTypeLabel` z existujícího kódu

## Edge case k odsouhlasení
- **Smazání session v historii**: smazat i navázané `client_meetings` a `cases`, nebo je nechat samostatně žít? Doporučuji **ponechat** (cascade by smazala reálnou aktivitu, kterou už uživatel mohl dál zpracovat) a v modalu jen ukázat info "tato session vytvořila X schůzek a Y případů".

---

**Než začnu kódovat, potřebuji odpovědi na 4 otázky výše** (především #2 ohledně data domluvené schůzky a #3 zda zakládat case automaticky).