## Kompaktnější týdenní zobrazení kalendáře

### Problém

Aktuálně se zobrazuje 15 hodin (7:00–21:00) najednou, každý 30min slot má 48px → celková výška ~1440px. Grid je příliš velký a vyžaduje hodně scrollování.

### Řešení

1. **Omezit viditelné okno na 5 hodin** — grid nově obsahuje všech 24 hodin (0–24), ale wrapper má fixní výšku odpovídající 5 hodinám a `overflow-y: auto` pro vertikální scroll.
2. **Automatický scroll na relevantní čas** — při načtení se grid automaticky posune na aktuální hodinu (nebo na první schůzku dne, pokud existuje).
3. **Zmenšit SLOT_HEIGHT** — snížit z 48px na ~40px pro kompaktnější vzhled.

### Technické změny

**Soubor: `src/pages/Kalendar.tsx**`

- Změnit `SLOT_HEIGHT` z `48` na `40`
- V `renderWeekView()` obalit time grid do kontejneru s:
  - `maxHeight: SLOT_HEIGHT * 2 * 5` (5 hodin = 10 slotů × SLOT_HEIGHT = 400px)
  - `overflow-y: auto`
  - `scroll-behavior: smooth`
- Přidat `useRef` na scrollovací kontejner
- V `useEffect` po renderování scrollnout na aktuální hodinu (`scrollTop = (currentHour - 7) * SLOT_HEIGHT * 2`)
- Day headers zůstávají sticky nahoře (už mají `sticky top-0`)