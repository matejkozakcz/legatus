## Cíl

Rozdělit "Novou call party" na výběr typu + víc kroků; přidat lobby pro skupinové party; přesunout leaderboard do samostatné záložky.

## A. Top-level záložky (`src/pages/CallParty.tsx`)

Současné: `Nová · Skupinová · Historie`
Nové: `Nová · Žebříček · Historie`

"Skupinová" jako samostatná záložka mizí — vstup do skupinové party jde přes chooser v "Nové", běžící/naplánované party se zobrazí jako "Pokračovat" karty na úvodu chooseru.

## B. "Nová call party" — chooser

Pokud uživatel nemá rozjetou party (žádná aktivní `live` group party kde je host nebo participant, žádný rozpracovaný private wizard), zobrazí se:

- Karta **Soukromá** (ikona `UserRound`) — krátký popisek "Budu volat sám."
- Karta **Skupinová** (ikona `Users`) — popisek "Apes together strong."

Pod tím (volitelně) řádek "Pokračovat" s aktivními/naplánovanými skupinovými party uživatele (klik → lobby/room).

## C. Soukromá — 3 kroky

1. **Setup** — Název + Datum + Cíle (`GoalsEditor`). Tlačítko "Pokračovat".
2. **Volání** — header (název, datum, progress cílů z aktuálních záznamů) + tabulka záznamů (současný `EntryRow`). Sticky bar "Mám dovoláno →".
3. **Naplánovat schůzky** — současný step 2 (ScheduleRow + Uložit).

`StepIndicator` rozšířen na 3 kroky.

## D. Skupinová — 3 kroky (wizard nahrazuje současný `GroupCallPartyCreateModal`)

Po kliknutí na "Skupinová" se nezobrazí dialog, ale inline wizard:

1. **Setup** — Název + Plánovaný start (datetime) + Délka (volitelná) + Cíle (calls, meetings) + Povolit externí odkaz.
  → "Pokračovat" → vytvoří `group_call_parties` v stavu `scheduled` a založí host záznam.
2. **Lobby (Pozvánky a guest list)** — header s názvem + plánovaným časem + countdown do startu.
  - Preset chipy (moje přímá / celá struktura / nováčci / workspace) — klik přidá nebo odebere skupinu jako pozvané participanty (insert/delete `group_call_party_participants`).
  - QR kód s odkazem (`/call-party/join/:token`) + tlačítko Kopírovat.
  - Guest list — `participants` z `useGroupParty`, badge `pozvaný` / `připojený` (podle `joined_at` vs. nepřítomnosti relevantní `call_party_session`). Host je zvýrazněn 👑.
  - Pole na úpravu plánovaného startu (datetime input → `scheduled_at`).
  - Tlačítko **Spustit teď** (host) → `group-call-party-action` `start`. Pro non-host: text "Připravit ke startu…".
3. **Live room** = stávající `GroupCallPartyRoom` (po přechodu z lobby).

Logika zobrazení: pokud party je `scheduled` → lobby, pokud `live` → room, pokud `ended` → room v read-only.

## E. Žebříček tab

Nová záložka. Logika:

- Vezme nejnovější `live` group party uživatele; pokud žádná, poslední `ended` z posledních 14 dní.
- Zobrazí header (název party, status, čas) + společný progress cílů + leaderboard (řazený podle hovorů) — vytaženo přes `useGroupParty` + `buildLeaderboard`.
- Empty state: "Zatím žádná skupinová party. Vytvoř první v 'Nová'."

## F. Mimo scope (pro V2/V3)

- Cheers reakce — vynecháno dle požadavku.
- Notifikace 5 min před startem (V3).
- PDF souhrn (V3).
- Cross-workspace discovery.

## Soubory

- `src/pages/CallParty.tsx` — chooser, 3-step private, nová tab struktura
- `src/components/group-call-party/GroupCallPartyWizard.tsx` (nový) — 3-step group flow s lobby
- `src/components/group-call-party/GroupCallPartyLeaderboardTab.tsx` (nový) — obsah Žebříček tabu
- `GroupCallPartyCreateModal.tsx` — odstraněn (nahrazen wizardem)
- `GroupCallPartyTab.tsx` — odstraněn nebo využit v chooser řádku "Pokračovat"

Žádné DB migrace — schéma stačí.