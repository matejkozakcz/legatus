

## Plán: Restrukturalizace výstupů schůzek

### Přehled

Kompletní přepracování struktury schůzek v Obchodních případech. Místo jednoho pole BJ a doporučení bude každá schůzka mít vnořené výstupy: Poradko, Pohovor, Doporučení — podle typu schůzky.

### Nová logika schůzek

```text
FSA (Analýza)
├── Zrušená? → pokud ano, konec (bez termínu)
├── Potenciál BJ (nepovinné číslo)
├── Poradko (nepovinný toggle)
│   ├── Podepsané BJ (povinné, ≥0)
│   ├── Pohovor (nepovinný toggle)
│   │   ├── Jde dál / Nejde dál
│   │   └── Doporučení (≥0)
│   └── Doporučení (≥0)
└── Pohovor (nepovinný toggle, nezávislý na Poradku)
│   ├── Jde dál / Nejde dál
│   └── Doporučení (≥0)
└── Doporučení (≥0, úroveň schůzky)

SER (Servis)
├── Zrušená? → pokud ano, konec (bez termínu)
├── Poradko (nepovinný toggle)
│   ├── Podepsané BJ (povinné, ≥0)
│   ├── Pohovor (nepovinný toggle)
│   │   ├── Jde dál / Nejde dál
│   │   └── Doporučení (≥0)
│   └── Doporučení (≥0)
├── Pohovor (nepovinný toggle)
│   ├── Jde dál / Nejde dál
│   └── Doporučení (≥0)
└── Doporučení (≥0, úroveň schůzky)
```

### 1. Databáze — migrace `client_meetings`

Přidat nové sloupce, zachovat existující data:

| Sloupec | Typ | Default | Popis |
|---|---|---|---|
| `cancelled` | boolean | false | Schůzka zrušena |
| `potencial_bj` | numeric | null | Potenciál BJ (pouze FSA) |
| `has_poradko` | boolean | false | Obsahuje Poradko |
| `podepsane_bj` | numeric | 0 | Podepsané BJ z Poradka |
| `poradko_doporuceni` | integer | 0 | Doporučení z Poradka |
| `has_poradko_pohovor` | boolean | false | Pohovor v rámci Poradka |
| `poradko_pohovor_jde_dal` | boolean | null | Jde dál (Poradko→Pohovor) |
| `poradko_pohovor_doporuceni` | integer | 0 | Doporučení (Poradko→Pohovor) |
| `has_pohovor` | boolean | false | Přímý Pohovor |
| `pohovor_jde_dal` | boolean | null | Jde dál (přímý Pohovor) |
| `pohovor_doporuceni` | integer | 0 | Doporučení (přímý Pohovor) |

Stávající `bj` → zůstane jako celkové BJ (= podepsane_bj, pro zpětnou kompatibilitu).
Stávající `ref_count` → celkový součet doporučení (= sum všech doporučení).
Stávající `vizi_spoluprace` → bude nahrazeno has_pohovor + pohovor_jde_dal (sloupec zachováme ale nebudeme používat).

**Migrace dat:** Existující záznamy s `bj > 0` dostanou `has_poradko = true`, `podepsane_bj = bj`. Záznamy s `vizi_spoluprace = true` dostanou `has_pohovor = true`, `pohovor_jde_dal = true`.

### 2. Aktualizace sync triggeru

Funkce `sync_activity_from_meetings` se upraví:
- `bj` = SUM(`podepsane_bj`) — podepsané BJ z poradek
- `ref_actual` = SUM všech doporučení (meeting + poradko + pohovor + poradko_pohovor)
- Zrušené schůzky se nezapočítávají do statistik

### 3. UI — Formulář (MeetingModal)

Přepracování formuláře:
1. **Horní řádek:** Datum + Typ (FSA/SER) — beze změny
2. **Toggle "Zrušená"** — pokud zapnuto, datum se skryje a zbytek formuláře také
3. **Potenciál BJ** (jen u FSA) — číselné pole
4. **Sekce Poradko** (toggle) → rozbalí: Podepsané BJ (povinné), toggle Pohovor, Doporučení
5. **Sekce Pohovor** (toggle, nezávislý) → rozbalí: Jde dál/Nejde dál, Doporučení
6. **Doporučení** (úroveň schůzky) — vždy viditelné
7. **Poznámka** — beze změny

### 4. UI — Statistiky a seznam

- Statistiky: FSA count, SER count, Podepsané BJ celkem, Doporučení celkem, Zrušené
- Mobilní karty a desktop tabulka: zobrazí nové pole (Potenciál BJ, Podepsané BJ, Pohovor status, počet doporučení souhrnně)
- Zrušené schůzky zobrazeny šedě s přeškrtnutím

### 5. Oprava TypeScript chyby

Současný build error (`as any` cast na `client_meetings`) se vyřeší po regeneraci typů z migrace. Odstraní se `as any` a použijí se správné typy.

### Soubory k úpravě
- **Migrace SQL** — nové sloupce + data migration + aktualizace sync funkce
- `src/pages/ObchodniPripady.tsx` — typy, formulář, statistiky, tabulka, karty

