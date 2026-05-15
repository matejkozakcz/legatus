# Skupinová Call Party

## Fáze 1 — Databáze

**Nové tabulky:**

```
group_call_parties
  id, name, host_id, org_unit_id
  scheduled_at, started_at, ended_at, planned_duration_min (nullable)
  status: scheduled | live | ended
  join_token (unique, rotovatelný)
  goals jsonb            -- { calls: 100, fsa: 10, poh: 5 }
  allow_external bool    -- pro link join mimo workspace
  created_at, updated_at

group_call_party_participants
  id, party_id, user_id
  joined_at, left_at (nullable)
  invited_via: 'host' | 'preset_direct' | 'preset_subtree' | 'preset_garant' | 'manual' | 'link'
  role: 'host' | 'caller'
  UNIQUE(party_id, user_id)
```

**Změny existujících:**
- `call_party_sessions` + `group_party_id uuid nullable` (FK volný — bez constraint kvůli RLS rychlosti)

**RLS:**
- party SELECT: host, účastníci, vedoucí v subtree hosta, admin
- party INSERT: kdokoli (host_id = auth.uid())
- party UPDATE: jen host
- public SELECT podle `join_token` (anon/authenticated) → join screen
- participants: účastník může číst svoje + ostatní v té samé party; host může všechny mazat

**Realtime publikace:**
- `group_call_parties`, `group_call_party_participants`, `call_party_entries` (už existuje? ověřit, případně přidat)

## Fáze 2 — Edge function

`group-call-party-action` — POST akce:
- `start` → status=live, started_at=now
- `end` → status=ended, ended_at=now
- `join_via_link` (token) → vytvoří participant row + návratová party data
- `rotate_token`

## Fáze 3 — UI

**`src/pages/CallParty.tsx`** — přidat tab "Skupinová" vedle existujícího single-mode.

**Nové komponenty:**

1. `GroupCallPartyList.tsx` — seznam mých party (host + účastník), tlačítko "Vytvořit"
2. `GroupCallPartyCreateModal.tsx`
   - Název, plánovaný start, volitelná délka, cíle (calls/FSA/POH)
   - Pozvánky:
     - Toggle "Moje přímá struktura" / "Celá struktura" / "Moji nováčci" / "Workspace"
     - PersonPicker pro manuální
     - Switch "Povolit připojení přes odkaz mimo workspace"
3. `GroupCallPartyRoom.tsx` — live UI:
   - Header: status, timer/countdown, společný cíl progress bar
   - Levý panel: existující call-party UI (entries) — reuse `useCallParty` + propíchnout `group_party_id`
   - Pravý panel: leaderboard (tabs: Hovory / Schůzky / Konverze) + live feed (posledních 20 událostí)
   - QR kód + odkaz pro pozvání (pro hosta)
   - Tlačítka: Start / End party (host only)
4. `JoinGroupCallParty.tsx` route `/call-party/join/:token` — landing s "Připojit se", po přihlášení zápis do participants

**Realtime:**
- Hook `useGroupParty(partyId)` — subscribe na entries + participants, agreguje leaderboard a feed
- Konfety při splnění cíle (`src/lib/confetti.ts`)

## Fáze 4 — Notifikace

- Push při pozvání (využije existující `notifications` + `send-push-notification` edge fn)
- Push 5 min před plánovaným startem

## Technické detaily

- QR kód: `qrcode.react` (nová dep)
- Časovač: čistý React interval, žádný cron
- Leaderboard agregace: client-side z entries (subscribe), bez RPC
- Limit: 1 live party per host současně (validace v edge fn)

## Co NEbudu dělat (mimo scope)

- Cheers/emoji reakce → V3
- Post-party PDF summary → V3
- Cross-workspace discovery (jen přes přímý odkaz)

## Pořadí buildu

1. Migrace (tabulky + RLS + realtime publikace)
2. Edge function
3. List + Create modal
4. Room (host + caller view)
5. Join route + QR
6. Push pozvánky
