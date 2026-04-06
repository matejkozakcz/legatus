

# Mobilní redesign stránky Aktivit člena

## Problem
Stránka `/tym/:userId/aktivity` (MemberActivity) zobrazuje desktopovou tabulku s 15 sloupci. Na mobilu (390px) je to nečitelné — horizontální scroll přes obrovskou tabulku bez jakékoli mobilní optimalizace.

## Řešení
Přidat mobilní větev do `MemberActivity.tsx` inspirovanou existujícím mobilním layoutem v `MojeAktivity.tsx` — ale **read-only** (vedoucí se jen dívá, neupravuje).

## Mobilní layout

```text
┌─────────────────────────────┐
│  ← Zpět    Jméno člena      │
│            Badge             │
│─────────────────────────────│
│  ◀  Týden 7.4. – 13.4.  ▶  │
│─────────────────────────────│
│  ┌──────────────────────┐   │
│  │     Analýzy          │   │
│  │  Domluvené  Proběhlé │   │
│  │     3    │    2      │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │     Porádka          │   │
│  │  Domluvené  Proběhlé │   │
│  │     1    │    1      │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │     Pohovory         │   │
│  │  Domluvené  Proběhlé │   │
│  │     2    │    1      │   │
│  └──────────────────────┘   │
│  ┌─────────┐ ┌─────────┐   │
│  │Doporuč. │ │   BJ    │   │
│  │   4     │ │   12    │   │
│  └─────────┘ └─────────┘   │
│─────────────────────────────│
│  Měsíční souhrn             │
│  FSA: 8/12  POH: 5/8       │
│  SER: 3/4   REF: 10/15     │
└─────────────────────────────┘
```

## Technické kroky

### 1. Upravit `MemberActivity.tsx`
- Přidat `useIsMobile()` hook
- Přidat navigaci po týdnech (stejný pattern jako MojeAktivity — offset od aktuálního týdne)
- Mobilní větev: karty s planned/actual hodnotami pro každou aktivitu (read-only, bez counterů)
- Dole měsíční souhrn jako 2x2 grid StatCardů
- Desktop větev zůstane beze změny

### 2. Header
- Zpětná šipka + jméno člena + role badge (kompaktnější než desktop verze)
- Bez ikony BarChart3 na mobilu (zbytečná)

### 3. Žádné změny v DB
- Stejná data, stejné queries, jen jiná prezentace

## Rozsah
Jeden soubor: `src/pages/MemberActivity.tsx`

