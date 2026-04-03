

## Plan: Push notifikace s deadliny

### Přehled

Nadřízený (Vedoucí, Garant, Získatel) bude moci ze stránky **Správa týmu** poslat push notifikaci svému přímému podřízenému — buď vlastní zprávou, nebo ze šablony. Notifikace se odešle ihned a automaticky se připomene den před deadlinem.

### Jak to bude fungovat

1. Na kartě člena týmu se objeví ikona zvonečku → otevře dialog pro vytvoření upozornění
2. V dialogu uživatel vybere šablonu (Osobní databáze, Analýza trhu, FSA...) nebo napíše vlastní zprávu + nastaví datum deadlinu
3. Notifikace se odešle ihned jako push + automaticky se naplánuje připomenutí den před deadlinem
4. Příjemce uvidí push notifikaci na telefonu (vyžaduje povolení notifikací)

### Databáze

**Nová tabulka `notifications`:**
- `id` (uuid, PK)
- `sender_id` (uuid, ref profiles) — kdo posílá
- `recipient_id` (uuid, ref profiles) — komu
- `title` (text) — název úkolu / šablony
- `message` (text) — vlastní zpráva
- `deadline` (date) — do kdy
- `reminder_sent` (boolean, default false) — zda bylo odesláno připomenutí
- `read` (boolean, default false)
- `created_at` (timestamptz)

**Nová tabulka `push_subscriptions`:**
- `id` (uuid, PK)
- `user_id` (uuid, ref profiles)
- `subscription` (jsonb) — Web Push subscription objekt
- `created_at` (timestamptz)

**RLS:**
- Sender může INSERT jen pro své přímé podřízené
- Recipient může SELECT + UPDATE (read) své notifikace
- Push subscriptions: user může CRUD jen vlastní

### Push notifikace (Web Push API)

1. **Service Worker** (`sw.js`) — přidat handler pro `push` event, který zobrazí systémovou notifikaci
2. **VAPID klíče** — vygenerovat a uložit jako secret (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
3. **Registrace na klientu** — po přihlášení požádat o povolení notifikací, uložit subscription do `push_subscriptions`
4. **Edge Function `send-push`** — přijme notification ID, načte subscription příjemce a odešle push přes Web Push protokol

### Připomenutí den předem

**Edge Function `check-reminders`** — spouštěná přes pg_cron každou hodinu:
- Najde notifikace kde `deadline = CURRENT_DATE + 1` a `reminder_sent = false`
- Odešle push notifikaci s textem "Zítra je deadline: {title}"
- Nastaví `reminder_sent = true`

### Šablony

Předdefinované šablony v kódu (ne v DB):
- Osobní databáze kontaktů
- Analýza trhu
- FSA schůzka
- Pohovor
- Servisní schůzka

Každá šablona má předvyplněný název a výchozí zprávu. Uživatel může text upravit.

### UI změny

**Stránka Správa týmu** — na kartu každého podřízeného přidat ikonu zvonečku

**Dialog „Nové upozornění":**
- Výběr šablony (dropdown) nebo vlastní zpráva
- Pole: Název, Zpráva, Deadline (date picker)
- Tlačítko Odeslat

**Dashboard / Bottom nav** — badge s počtem nepřečtených notifikací

**Nová sekce na Dashboardu** — seznam nadcházejících deadlinů (příjemcovy notifikace)

### Soubory k vytvoření/úpravě

| Soubor | Změna |
|--------|-------|
| `supabase/migrations/` | Nové tabulky notifications, push_subscriptions |
| `supabase/functions/send-push/index.ts` | Edge Function pro odeslání push |
| `supabase/functions/check-reminders/index.ts` | Cron job pro připomenutí |
| `public/sw.js` | Push event handler |
| `src/main.tsx` | Registrace push subscription po přihlášení |
| `src/components/CreateNotificationDialog.tsx` | Dialog pro vytvoření upozornění |
| `src/pages/SpravaTeam.tsx` | Ikona zvonečku na kartách členů |
| `src/pages/Dashboard.tsx` | Sekce s deadliny + badge |
| `src/components/MobileBottomNav.tsx` | Badge nepřečtených |

### Technické detaily

- Web Push API vyžaduje VAPID klíče — budou vygenerovány a uloženy jako secrets
- VAPID_PUBLIC_KEY bude v kódu (veřejný), VAPID_PRIVATE_KEY jako secret v Edge Functions
- Push subscription se ukládá při prvním přihlášení (browser prompt)
- `check-reminders` cron job poběží každou hodinu (`0 * * * *`)
- Ihned po vytvoření notifikace se volá `send-push` Edge Function

