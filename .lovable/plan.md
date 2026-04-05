

# Upozornění Vedoucího při nároku na povýšení

## Současný stav
- `SpravaTeam.tsx` už obsahuje `checkPromotions()` — při otevření stránky Správa týmu detekuje Získatele splňující kritéria (≥1000 BJ + ≥2 ve struktuře) a vytvoří záznam v `promotion_requests`
- Vedoucí vidí čekající povýšení jako karty v sekci "Čekající povýšení" na stránce Správa týmu
- Existuje tabulka `notifications` s typem, title, body, recipient_id, sender_id
- `NotificationBell` zobrazuje notifikace s ikonou podle typu

## Problém
Vedoucí se o nároku dozví **pouze** když otevře Správu týmu. Žádná notifikace se mu nezobrazí ve zvonečku.

## Řešení

### 1. Při vytvoření promotion_request vytvořit notifikaci pro Vedoucího

V `SpravaTeam.tsx` v `checkPromotions()` — po úspěšném upsertu do `promotion_requests` vložit záznam do `notifications`:
- `type: "promotion_eligible"` 
- `recipient_id: profile.id` (Vedoucí)
- `sender_id: candidate.id` (Získatel)
- `title: "{jméno} splňuje podmínky pro povýšení na Garanta"`
- `body: "Kumulativní BJ: X · Y lidí ve struktuře"`

Důležité: upsert `promotion_requests` používá `ignoreDuplicates: true`, takže se nevytvoří duplicitní request. Pro notifikaci je potřeba ověřit, zda promotion_request **skutečně vznikl nově** (nebyl ignorován). Toho dosáhnu kontrolou, zda pro daného kandidáta + roli + status "pending" už notifikace existuje.

### 2. Přidat ikonu pro nový typ notifikace

V `NotificationBell.tsx` přidat do `TYPE_ICONS`:
- `promotion_eligible: <TrendingUp />` s teal barvou (konzistentní se sekcí v SpravaTeam)

### 3. RLS – INSERT politika

Aktuální INSERT politika na `notifications` vyžaduje, aby příjemce byl přímý podřízený odesílatele. V tomto případě je odesílatel Vedoucí sám sobě — `sender_id = recipient_id = profile.id`. Toto je povoleno stávající RLS, protože Vedoucí je ve svém vlastním subtree. Případně nastavím `sender_id` na kandidáta — ten je podřízený Vedoucího, což splňuje podmínku.

Aktuálně INSERT check vyžaduje: `auth.uid() = sender_id` AND recipient je podřízený. Takže nastavím `sender_id = profile.id` (Vedoucí) a `recipient_id = profile.id` (Vedoucí). Ale RLS check říká recipient musí být podřízený senderu — Vedoucí není podřízený sám sobě v tom filtru. Budu muset buď:
- Přidat RLS politiku pro self-notifications (sender = recipient = auth.uid())
- Nebo použít jiný přístup

Přidám novou INSERT RLS politiku: "Users can insert self notifications" — `auth.uid() = sender_id AND auth.uid() = recipient_id`.

## Soubory k úpravě
- `src/pages/SpravaTeam.tsx` — po upsert promotion_request vložit notifikaci
- `src/components/NotificationBell.tsx` — ikona pro `promotion_eligible`
- **Migrace** — nová RLS politika na `notifications` pro self-notifications

## Co se nemění
- Tabulka `promotion_requests` — beze změn
- Schvalování/zamítání — zůstává stejné
- Detekční logika — zůstává stejná, jen přidáme notifikaci

