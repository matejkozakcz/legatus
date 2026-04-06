

# God Mode Admin Dashboard

## Cil
Vytvorit samostatnou stranku `/admin` pristupnou pouze v God Mode, kde lze rucne menit vsechny business-logic parametry bez zasahu do kodu.

## Co bude konfigurovatelne

### 1. Pravidla povyseni
Aktualne hardcoded v `checkPromotions.ts`:
- Ziskatel → Garant: **1000 BJ** + **2 lidi ve strukture**
- Garant → BV: **5 lidi ve strukture** + **3 primi**
- BV → Vedouci: **10 lidi ve strukture** + **6 primych**

### 2. Produkci obdobi
Aktualne hardcoded v `productionPeriod.ts`:
- Konec obdobi = 27. den mesice (nebo nasledujici pracovni den)
- Prosinec = prvni pracovni den ledna

### 3. Sprava uzivatelu (primo v tabulce)
- Editace profilu kohokoliv (role, vedouci_id, garant_id, ziskatel_id, BJ cile, is_active, osobni_id)
- Rucni zmena role bez promotion flow

### 4. BJ a aktivity
- Editace activity_records a client_meetings libovolneho uzivatele
- Korekce BJ hodnot

## Technicke reseni

### Databaze — nova tabulka `app_config`
```sql
CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);
-- RLS: jen admin muze cist/zapisovat
```

Klice:
- `promotion_rules` → `{ "ziskatel_to_garant": { "min_bj": 1000, "min_structure": 2 }, "garant_to_bv": { "min_structure": 5, "min_direct": 3 }, "bv_to_vedouci": { "min_structure": 10, "min_direct": 6 } }`
- `period_end_day` → `{ "default": 27, "december_rule": "first_working_day_january" }`

### Kod
1. **`src/pages/AdminDashboard.tsx`** — nova stranka s taby:
   - **Pravidla povyseni** — formular pro BJ prahy, pocty lidi; uklada do `app_config`
   - **Produkci obdobi** — nastaveni dne konce obdobi
   - **Uzivatele** — tabulka vsech profilu s inline editaci (role, vazby, BJ cile, is_active)
   - **BJ korekce** — vyhledani uzivatele, zobrazeni jeho activity_records, moznost editace

2. **Uprava `checkPromotions.ts`** — nacte prahy z `app_config` misto hardcoded konstant

3. **Uprava `productionPeriod.ts`** — nacte den konce obdobi z `app_config` s fallbackem na 27

4. **Route v `App.tsx`** — `/admin` chranena pres `godMode && isAdmin`

5. **Odkaz v `AppSidebar.tsx`** — zobrazit jen kdyz je God Mode aktivni

### Pristup a bezpecnost
- `app_config` tabulka s RLS: jen `is_admin()` ma SELECT/UPDATE/INSERT
- Stranka se renderuje jen pri `godMode && isAdmin` — jinak redirect na `/dashboard`
- Zadne zmeny neni mozne provest bez admin prav

### Rozsah prvni verze
Zamereni na **pravidla povyseni** a **spravu uzivatelu** — to jsou veci, ktere resite nejcasteji. Produkci obdobi a BJ korekce jako druhy krok.

