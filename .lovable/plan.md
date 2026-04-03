

## Plán: Self-registrace s onboardingem

### Přehled

Login stránka dostane tlačítko "Vytvořit účet" pro email/heslo registraci. OAuth (Google/Apple) automaticky vytvoří účet, pokud neexistuje (to už funguje přes `handle_new_user` trigger). Po první registraci se nový uživatel místo přesměrování na dashboard dostane do onboarding modalu, kde vyplní své údaje.

### Databáze

**Migrace** — přidat sloupec `ziskatel_name` (text, nullable) do `profiles` pro případ, kdy Získatel není v systému:

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ziskatel_name text;
```

Dále přidat sloupec `onboarding_completed` (boolean, default false):

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
```

### Změny

| Krok | Soubor | Co |
|------|--------|----|
| 1 | DB migrace | Přidat `ziskatel_name` a `onboarding_completed` do profiles |
| 2 | `src/pages/Login.tsx` | Přidat tlačítko "Vytvořit účet" — přepne formulář do režimu registrace (email + heslo + potvrzení hesla), volá `supabase.auth.signUp()` |
| 3 | `src/components/OnboardingModal.tsx` | Nový komponent — modal se stejným vizuálem jako login karta (bílý, rounded 28px). Obsahuje: avatar upload (kruhový, kliknutelný), jméno + příjmení vedle sebe, PersonPicker pro Vedoucího (vyhledávání mezi všemi vedoucími), PersonPicker pro Získatele + textový input jako fallback |
| 4 | `src/contexts/AuthContext.tsx` | Rozšířit `Profile` interface o `onboarding_completed` a `ziskatel_name`. Přidat `needsOnboarding` boolean do kontextu (true pokud profil existuje ale `onboarding_completed === false`) a `refetchProfile` funkci |
| 5 | `src/pages/Login.tsx` | Po přihlášení/registraci: pokud `needsOnboarding`, zobrazit `OnboardingModal` místo redirect na dashboard |
| 6 | RLS | Přidat SELECT policy na profiles pro čtení vedoucích (role='vedouci') všemi authenticated uživateli — potřeba pro PersonPicker v onboardingu |

### Onboarding modal — detail

- Vizuálně jako login karta (bílé pozadí, border-radius 28px, shadow)
- Zobrazí se jako overlay nad login pozadím
- **Avatar**: kruhový placeholder s ikonou Camera, klik otevře file picker, upload do `avatars` bucketu
- **Jméno / Příjmení**: dva inputy vedle sebe, povinné
- **Vedoucí**: PersonPicker, načte všechny profily s `role = 'vedouci'` a `is_active = true`
- **Získatel**: PersonPicker se všemi lidmi pod vybraným vedoucím. Pod ním checkbox/odkaz "Získatel není v systému" → zobrazí textový input `ziskatel_name` místo pickeru, vedoucí se automaticky stane získatelem
- **Tlačítko "Dokončit"**: uloží `full_name`, `vedouci_id`, `garant_id` (= vedoucí), `ziskatel_id` nebo `ziskatel_name`, `avatar_url`, `onboarding_completed = true`

### RLS pro onboarding

Nová SELECT policy na profiles:
```sql
CREATE POLICY "Authenticated can view vedouci profiles"
ON public.profiles FOR SELECT TO authenticated
USING (role = 'vedouci' AND is_active = true);
```

Nová SELECT policy pro čtení členů pod vedoucím (pro získatel picker):
```sql
CREATE POLICY "Authenticated can view members under vedouci"
ON public.profiles FOR SELECT TO authenticated
USING (is_active = true AND vedouci_id IS NOT NULL);
```

### Technické detaily

- Registrace přes `supabase.auth.signUp({ email, password })` — trigger `handle_new_user` automaticky vytvoří profil s `role = 'novacek'`, `is_active = true`, `onboarding_completed = false`
- OAuth registrace funguje stejně — trigger vytvoří profil, onboarding se zobrazí díky `onboarding_completed = false`
- Avatar upload používá stejný pattern jako `ProfileSettingsModal` — upload do `avatars` bucketu, public URL
- Garant se při onboardingu nastaví automaticky na vedoucího (nováček nemá ještě garanta, vedoucí ho přiřadí později)
- Auto-confirm email: bude potřeba zapnout, jinak uživatel nemůže pokračovat bez verifikace emailu

