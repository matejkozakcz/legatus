

# Member Detail jako vstupní bod v sekci Tým

## Problem
Kliknutí na kartu člena rovnou otevře formulář pro úpravu — to je akce, kterou vedoucí dělá jednou za čas. Denně potřebuje hlavně vidět přehled a případně poslat připomínku.

## Navrhované řešení
Kliknutí na kartu → otevře **MemberDetailModal** (přehled). Z přehledu jsou dostupné akce přes tlačítka.

## Co uvidí Vedoucí/BV po kliknutí na člena

```text
┌─────────────────────────────┐
│  [Avatar]  Jméno            │
│  Badge: Získatel            │
│─────────────────────────────│
│  Statistiky tohoto týdne    │
│  FSA: 3/5  POH: 2/3  ...   │
│─────────────────────────────│
│  Nadcházející schůzky (2)   │
│  · Pondělí 14:00 - Analýza  │
│  · Středa 10:00 - Pohovor   │
│─────────────────────────────│
│  Historie povýšení          │
│  · timeline...              │
│─────────────────────────────│
│  [Poslat připomínku]        │
│  [Zobrazit aktivity →]      │
│  [Upravit profil ✎]         │
└─────────────────────────────┘
```

## Technické kroky

### 1. Rozšířit MemberDetailModal
- Přidat sekci **Nadcházející schůzky** — query `client_meetings` pro daného člena, filtr na budoucí datum, limit 3
- Přidat tlačítko **Poslat připomínku** — otevře `CreateNotificationDialog` s předvyplněným příjemcem
- Přidat tlačítko **Upravit profil** — otevře `EditMemberDialog` (jen pro vedoucí/god mode)
- Předat `onEdit` a `onNotify` callbacky z rodiče

### 2. Upravit SpravaTeam.tsx
- Kliknutí na kartu → `setDetailMember(member)` místo `setEditMember(member)`
- Nový state `detailMember` pro MemberDetailModal
- Z MemberDetailModal se volá `setEditMember` nebo `setNotifyMember` přes callbacky
- Garant/Získatel (readonly) uvidí detail bez tlačítka Upravit

### 3. Bez změn v DB
- Všechna data (stats, meetings, promotion history) jsou už dostupná přes existující RLS politiky
- Žádné nové tabulky ani migrace

## Rozsah
- 2 soubory: `MemberDetailModal.tsx` (rozšíření), `SpravaTeam.tsx` (přesměrování kliknutí)
- Stávající `EditMemberDialog` a `CreateNotificationDialog` zůstanou beze změn

