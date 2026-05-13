## Plán: Náborová cesta (Recruitment Funnel)

Volitelný modul (`org_units.show_recruitment_funnel`), integrovaný **jako záložka v Můj byznys**. Žádný nový top-level routing, žádný Dashboard widget, žádná vazba na Zapracování.

---

### 1) Fáze (potvrzeno)

`CALL → (NAB) → POH → INFO → POST → REG → SUPERVIZE`

- **NAB lze přeskočit** — z CALLu může být domluven rovnou Pohovor.
- **REG** = první registrace v Legatovi (osobní_id vyplněno).
- **SUPERVIZE** = finální fáze (závěrečná zkouška u Partners) — manuálně označovaná, viditelná v progress baru.
- **LOST** = kandidát vypadl (s důvodem).

### 2) Datový model

**Nová tabulka `recruitment_candidates**`

- `id`, `org_unit_id`, `owner_id` (kdo kandidáta vede — vedoucí/BV/garant/získatel)
- `full_name`, `phone`, `email`, `source` (call/doporučení/jiné)
- `current_stage` enum: CALL/NAB/POH/INFO/POST/REG/SUPERVIZE/LOST
- `stage_changed_at`, `stage_history jsonb` (pole `{stage, at, by}`)
- `lost_reason text NULL`
- `registered_profile_id uuid NULL` (po registraci ukazuje na `profiles.id`)
- `notes`

**Rozšíření `client_meetings**`

- `recruitment_candidate_id uuid NULL` — link na kandidáta pro POH/NAB
- pro INFO/POST: nová tabulka `info_attendees` (M:N), protože účastní se víc lidí:
  - `meeting_id`, `candidate_id`, `attended bool NULL` (NULL = neodklikáno)

**Rozšíření `call_party_entries**`

- `created_candidate_id uuid NULL` — když z callu vznikne kandidát

**Feature flag**: `org_units.show_recruitment_funnel boolean DEFAULT false` + toggle v `WorkspaceDetailModal` (vedle BJ funnel).

### 3) UI/UX

**3.1 Můj byznys — nová záložka „Nábor"**

- Seznam vlastních kandidátů + filtr podle fáze.
- Pro **vedoucí/BV** přepínač **„Moji přímí / Celá struktura"** (analogie `is_in_vedouci_subtree`).
- Karta kandidáta = vodorovný progress bar 7 fází, datum poslední změny, tlačítka „Posunout / Označit ztracený / Otevřít detail".
- **Detail kandidáta**: timeline (CALL z X. X., POH z X. X., …) s odkazy na konkrétní schůzky, plus pole pro poznámky a kontakt.

**3.2 Modal Pohovor / Nábor (`MeetingDetailModal`)**

- Nová sekce **„Náborová cesta"** s pickerem kandidáta (autocomplete podle jména/telefonu) + tlačítko „+ Nový kandidát" (inline mini-form).
- Po uložení s `vizi_spoluprace=true` (POH) nebo `outcome_recorded=true` (NAB) → automaticky posune fázi kandidáta (NAB→POH, POH→INFO).
- Pokud `jde_dal=false` → návrh „Označit jako ztraceného" (nepovinné).

**3.3 Modal Info / Postinfo**

- Nové pole **„Účastníci"** = multi-select kandidátů (z workspace).
- Po proběhnutí schůzky se v detailu zobrazí **checklist účastníků** s 3 stavy: ✓ účastnil / ✗ nepřišel / ? neodklikáno.
- Vedoucí/BV/Garant, který kandidáta vede, vidí v notifikacích / v kandidátově detailu „odklikni účast na Info z 14. 5.".
- Po potvrzení účasti se fáze posouvá (INFO→POST, POST→REG-čekající-na-osobní-id).

**3.4 Obchodní případ s daným člověkem**

- V detailu existujícího OP (po registraci) se v sekci „Aktivity / historie" vypíšou i Info/Postinfo schůzky, kterých se účastnil **před registrací**, jako běžné položky timeline (read-only chip „Náborová cesta").

**3.5 Auto-posun fáze (potvrzeno)**

- Po `outcome_recorded=true` u POH/NAB → posun.
- Po odkliknutí účasti u INFO/POST → posun.
- REG se posune automaticky, když je k `registered_profile_id` přiřazen `profiles` s vyplněným `osobní_id` (use existing trigger `auto_promote_to_ziskatel`).
- SUPERVIZE a LOST = vždy manuálně.

**3.6 Z callu rovnou Pohovor (potvrzeno)**

- V `CallParty` při vytváření kandidáta umožnit volbu „Domluveno: NAB / POH" — dle volby se vytvoří kandidát s počáteční fází NAB nebo přímo POH a předvyplní se nová schůzka.

### 4) Centrální výpočet

`**src/lib/recruitmentFunnel.ts**`

```ts
type Stage = "CALL"|"NAB"|"POH"|"INFO"|"POST"|"REG"|"SUPERVIZE"|"LOST";
export function computeRecruitmentFunnel(rows: CandidateRow[]): {
  byStage: Record<Stage, number>;
  conversion: number;          // REG / (vše kromě LOST)
  avgDaysToReg: number;
};
```

Použito v záložce „Náborová cesta" pro hlavičku se souhrnem.

### 5) Rozsah

- **Bez** Dashboard widgetu.
- **Bez** PDF exportu (může přijít později).
- **Bez** vazby na Zapracování (`onboarding_tasks` zůstávají úplně oddělené).

### 6) Otevřené body před implementací

a) **MVP iterace 1**: tabulka + flag + záložka v Můj byznys (read+create+manuální posun) + picker v POH/NAB/INFO/POST modalech + checklist účastníků. **Bez** notifikací, **bez** auto-posunu na REG.
**Iterace 2**: notifikace („odklikni účast", „kandidát stagnuje 14 dní"), auto-REG při registraci, integrace do OP timeline.

b) **Viditelnost mezi vedoucími napříč workspaces**: kandidát patří jednomu `org_unit_id`. Vedoucí jiného workspace ho nevidí (RLS).

c) **„SUPERVIZE"** — potvrzuješ, že to je samostatná fáze za REG (kandidát už je v Legatu jako získatel/nováček, ale sledujeme až po závěrečnou zkoušku)? Pokud ano, kdo ji označuje — vedoucí kandidáta, nebo si ji označí kandidát sám v profilu?

### Soubory (orientačně)

- migrace: `recruitment_candidates`, `info_attendees`, sloupce v `client_meetings`/`call_party_entries`/`org_units`
- `src/lib/recruitmentFunnel.ts` (nový)
- `src/hooks/useWorkspaceSettings.ts` (rozšíření o `showRecruitmentFunnel`)
- `src/pages/MojeAktivity.tsx` nebo wrapper Můj byznys → nová záložka
- `src/components/recruitment/RecruitmentTab.tsx`, `CandidateCard.tsx`, `CandidateDetailModal.tsx`, `CandidatePicker.tsx`, `InfoAttendeesChecklist.tsx`
- úpravy: `MeetingDetailModal.tsx`, `MeetingFormFields.tsx`, `CallParty.tsx`, `ObchodniPripady.tsx` (timeline chip), `WorkspaceDetailModal.tsx` (toggle)

---

**Otázka**: Potvrzuješ bod **6c** (SUPERVIZE jako samostatná fáze a kdo ji označuje) a jdeme stylem **Iterace 1 nyní**?