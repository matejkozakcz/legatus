import { useState, useEffect, useRef, useCallback } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Camera, ChevronDown, ChevronUp, Loader2, Zap, LogOut, Bell, RefreshCw, CheckCircle2, Calendar as CalendarIcon, Link2, Unlink2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAppVersion } from "@/hooks/useAppVersion";
import { PaymentsTable, calcPrice, PLAN_LABELS, StatusBadge, type BillingRow, type PaymentRow } from "@/components/billing/BillingShared";
import { format } from "date-fns";
import { cs as csLocale } from "date-fns/locale";


interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: number;
}

export function SettingsModal({ open, onClose, initialTab = 0 }: SettingsModalProps) {
  useBodyScrollLock(open);
  const { user, profile, isAdmin, godMode, toggleGodMode, signOut } = useAuth();
  const { theme, autoTheme, setAutoTheme } = useTheme();
  const isDark = theme === "dark";
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(initialTab);
  const [jmeno, setJmeno] = useState("");
  const [prijmeni, setPrijmeni] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const pushState = usePushSubscription();
  const { isStale, performUpdate, serverVersion, localVersion, refresh: refreshVersion } = useAppVersion();
  const [updating, setUpdating] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);

  // ── Calendar connection state ──
  const [calConnection, setCalConnection] = useState<{ account_email: string; last_sync_at: string | null } | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [calConnecting, setCalConnecting] = useState(false);
  const [calBackfilling, setCalBackfilling] = useState(false);

  const fetchCalConnection = useCallback(async () => {
    if (!user) return;
    setCalLoading(true);
    const { data } = await supabase
      .from("user_calendar_connections" as any)
      .select("account_email,last_sync_at")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();
    setCalConnection(data as any);
    setCalLoading(false);
  }, [user]);

  useEffect(() => {
    if (open) fetchCalConnection();
  }, [open, fetchCalConnection]);

  // Detect OAuth return (?calendar_link=ok|error)
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("calendar_link");
    if (status) {
      if (status === "ok") {
        toast.success("Google kalendář propojen ✓");
        fetchCalConnection();
      } else {
        toast.error("Nepodařilo se propojit Google kalendář: " + (params.get("calendar_msg") || "neznámá chyba"));
      }
      params.delete("calendar_link");
      params.delete("calendar_msg");
      const newSearch = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (newSearch ? "?" + newSearch : ""));
    }
  }, [open, fetchCalConnection]);

  const handleConnectCalendar = async () => {
    setCalConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Nejste přihlášen");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth?action=start&origin=${encodeURIComponent(window.location.origin)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const json = await res.json();
      if (!json.url) throw new Error(json.error || "Chyba");
      window.location.href = json.url;
    } catch (err: any) {
      toast.error(err.message || "Nepodařilo se zahájit propojení");
      setCalConnecting(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    if (!confirm("Opravdu chcete odpojit Google kalendář? Existující exportované události zůstanou v Google, ale budoucí změny se nebudou synchronizovat.")) return;
    setCalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Nejste přihlášen");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth?action=disconnect`;
      await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      setCalConnection(null);
      toast.success("Google kalendář odpojen");
    } catch (err: any) {
      toast.error(err.message || "Chyba při odpojování");
    } finally {
      setCalLoading(false);
    }
  };

  const handleBackfillCalendar = async () => {
    setCalBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-meeting-to-calendar", {
        body: { backfill: true },
      });
      if (error) throw error;
      const result = data as any;
      if (result?.failed > 0) {
        const firstError = result?.errors?.[0];
        const reason = firstError?.reason || firstError?.details?.error?.details?.[0]?.reason;
        if (reason === "SERVICE_DISABLED" || reason === "accessNotConfigured") {
          toast.error("Export selhal: v Google Cloud projektu není zapnuté Google Calendar API.");
          return;
        }
        toast.error(`Export selhal u ${result.failed} schůzek.`);
        return;
      }
      toast.success(`Exportováno ${(data as any)?.success || 0} schůzek do Google kalendáře`);
      fetchCalConnection();
    } catch (err: any) {
      toast.error(err.message || "Chyba při exportu schůzek");
    } finally {
      setCalBackfilling(false);
    }
  };

  // Force a version check whenever the modal opens — realtime websocket is
  // unreliable in installed PWA contexts.
  useEffect(() => {
    if (!open) return;
    setCheckingVersion(true);
    refreshVersion().finally(() => setCheckingVersion(false));
  }, [open, refreshVersion]);

  useEffect(() => {
    if (open && profile) {
      const parts = (profile.full_name || "").split(" ");
      setJmeno(parts[0] ?? "");
      setPrijmeni(parts.slice(1).join(" ") ?? "");
      setAvatarUrl(profile.avatar_url);
      setShowPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
      setActiveTab(initialTab);
    }
  }, [open, profile, initialTab]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, handleEscape]);
  const profileOrgUnitId = (profile as any)?.org_unit_id as string | null | undefined;

  // ── Owner / billing detection ──
  const { data: ownerInfo } = useQuery({
    queryKey: ["settings_owner_check", user?.id, profileOrgUnitId],
    enabled: !!user && !!profileOrgUnitId && profile?.role === "vedouci",
    queryFn: async () => {
      const { data } = await supabase
        .from("org_units")
        .select("id, owner_id")
        .eq("id", profileOrgUnitId!)
        .maybeSingle();
      return data;
    },
  });
  const isOwner = !!ownerInfo && ownerInfo.owner_id === user?.id;
  const orgUnitId = profileOrgUnitId ?? null;

  const { data: ownerBilling } = useQuery({
    queryKey: ["owner_billing", orgUnitId],
    enabled: isOwner && !!orgUnitId,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_billing")
        .select("*")
        .eq("org_unit_id", orgUnitId!)
        .maybeSingle();
      return (data ?? null) as BillingRow | null;
    },
  });

  const { data: ownerPayments = [] } = useQuery({
    queryKey: ["owner_payments", orgUnitId],
    enabled: isOwner && !!orgUnitId,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_payments")
        .select("*")
        .eq("org_unit_id", orgUnitId!)
        .order("paid_at", { ascending: false });
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

  const { data: ownerMemberCount = 0 } = useQuery({
    queryKey: ["owner_member_count", orgUnitId],
    enabled: isOwner && !!orgUnitId,
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_unit_id", orgUnitId!)
        .eq("is_active", true);
      return count ?? 0;
    },
  });

  if (!open || !user || !profile) return null;

  const initials =
    profile.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { resizeImage } = await import("@/lib/imageResize");
      const compressed = await resizeImage(file, 800, 0.85);
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;
      setAvatarUrl(publicUrl);
      queryClient.invalidateQueries();
      toast.success("Profilová fotka aktualizována");
    } catch (err: any) {
      toast.error(err.message || "Chyba při nahrávání fotky");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    setPasswordError("");
    if (!jmeno.trim() || !prijmeni.trim()) {
      toast.error("Jméno a příjmení jsou povinné");
      return;
    }
    if (showPassword && (newPassword || confirmPassword)) {
      if (newPassword.length < 8) {
        setPasswordError("Heslo musí mít alespoň 8 znaků");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("Hesla se neshodují");
        return;
      }
    }
    setSaving(true);
    try {
      const fullName = `${jmeno.trim()} ${prijmeni.trim()}`;
      const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
      if (profileError) throw profileError;
      if (showPassword && newPassword && newPassword === confirmPassword) {
        const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
        if (pwError) throw pwError;
      }
      queryClient.invalidateQueries();
      toast.success("Profil aktualizován");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Chyba při ukládání");
    } finally {
      setSaving(false);
    }
  };



  const selectClass =
    "h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground";
  const inputClass =
    "w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground";

  const renderToggleRow = (
    label: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    children?: React.ReactNode,
  ) => (
    <div className="py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ background: checked ? "hsl(var(--secondary))" : "hsl(var(--muted))" }}
        >
          <span
            className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            style={{ transform: checked ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
          />
        </button>
      </div>
      {checked && children && <div className="pl-0 space-y-2">{children}</div>}
    </div>
  );

  // TAB CONTENT
  const renderProfil = () => (
    <div className="space-y-5">
      {/* Avatar */}
      <div className="flex flex-col items-center">
        <div
          className="relative w-20 h-20 rounded-full cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" loading="lazy" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "hsl(var(--deep))" }}
            >
              <span className="text-xl font-heading font-semibold text-white">{initials}</span>
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera className="h-6 w-6 text-white" />
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
      </div>

      <div className="border-t border-border" />

      {/* Name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Jméno</label>
          <input type="text" value={jmeno} onChange={(e) => setJmeno(e.target.value)} className={inputClass} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Příjmení</label>
          <input
            type="text"
            value={prijmeni}
            onChange={(e) => setPrijmeni(e.target.value)}
            className={inputClass}
            required
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
        <input
          type="email"
          value={user.email || ""}
          readOnly
          className={`${inputClass} opacity-60 cursor-not-allowed`}
        />
      </div>

      <div className="border-t border-border" />

      {/* Password */}
      <button
        type="button"
        onClick={() => {
          setShowPassword(!showPassword);
          if (showPassword) {
            setNewPassword("");
            setConfirmPassword("");
            setPasswordError("");
          }
        }}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {showPassword ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Změnit heslo
      </button>
      {showPassword && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nové heslo</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPasswordError("");
              }}
              placeholder="Min. 8 znaků"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Potvrdit heslo</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordError("");
              }}
              className={inputClass}
            />
          </div>
          {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
        </div>
      )}

      {/* Auto theme by Prague sunrise/sunset */}
      <div className="border-t border-border" />
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Automatický režim podle slunce</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Světlý/tmavý režim se přepíná podle východu a západu slunce v Praze.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoTheme}
          onClick={() => setAutoTheme(!autoTheme)}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
          style={{ background: autoTheme ? "hsl(var(--accent))" : "hsl(var(--muted))" }}
        >
          <span
            className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            style={{ transform: autoTheme ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
          />
        </button>
      </div>

      {/* Calendar sync */}
      <div className="border-t border-border" />
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Propojené kalendáře</p>
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <CalendarIcon className="h-4 w-4 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Google kalendář</p>
              <p className="text-xs text-muted-foreground leading-snug">
                {calLoading
                  ? "Načítání…"
                  : calConnection
                    ? `Propojeno (${calConnection.account_email})`
                    : "Schůzky se automaticky exportují do vašeho kalendáře"}
              </p>
            </div>
          </div>
          {calConnection ? (
            <button
              onClick={handleDisconnectCalendar}
              disabled={calLoading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border border-border text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0"
            >
              {calLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink2 className="h-3.5 w-3.5" />}
              Odpojit
            </button>
          ) : (
            <button
              onClick={handleConnectCalendar}
              disabled={calConnecting}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50 shrink-0"
            >
              {calConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Připojit
            </button>
          )}
        </div>
        {calConnection && (
          <button
            onClick={handleBackfillCalendar}
            disabled={calBackfilling}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {calBackfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Exportovat všechny budoucí schůzky
          </button>
        )}
      </div>

      {/* App update */}
      <div className="border-t border-border" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {checkingVersion ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          ) : isStale ? (
            <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#10b981" }} />
          )}
          <p className="text-sm font-medium text-foreground">
            {checkingVersion
              ? "Kontroluji verzi…"
              : isStale
              ? "Je k dispozici nová verze"
              : "Verze je aktuální"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isStale && (
            <button
              type="button"
              onClick={async () => {
                setCheckingVersion(true);
                try { await refreshVersion(); } finally { setCheckingVersion(false); }
              }}
              disabled={checkingVersion}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {checkingVersion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Zkontrolovat
            </button>
          )}
          {isStale && (
            <button
              type="button"
              onClick={async () => {
                setUpdating(true);
                try { await performUpdate(); } catch { setUpdating(false); }
              }}
              disabled={updating}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Aktualizovat
            </button>
          )}
        </div>
      </div>

      {/* God mode */}
      {isAdmin && (
        <>
          <div className="border-t border-border" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: godMode ? "hsl(var(--destructive))" : undefined }} />
              <div>
                <p className="text-sm font-medium text-foreground">God Mode</p>
                <p className="text-xs text-muted-foreground">
                  {godMode ? "Admin pohled aktivní" : "Zobrazuji vlastní data"}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={godMode}
              onClick={toggleGodMode}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ background: godMode ? "hsl(var(--destructive))" : "hsl(var(--muted))" }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: godMode ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
              />
            </button>
          </div>
        </>
      )}

      {/* Save */}
      <button
        onClick={handleSaveProfile}
        disabled={saving}
        className="btn btn-primary btn-md w-full flex items-center justify-center gap-2 mt-2"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Uložit změny
      </button>
    </div>
  );


  const renderNotifikace = () => {
    const { permission, isSubscribed, isLoading, enable, disable } = pushState;
    const unsupported = permission === "unsupported";
    const denied = permission === "denied";
    const granted = permission === "granted";

    const statusLabel = unsupported
      ? "Nepodporováno"
      : denied
      ? "Zakázány"
      : granted && isSubscribed
      ? "Povoleny ✓"
      : granted
      ? "Povoleny (čeká registrace)"
      : "Čekají na povolení";

    const handleToggle = async () => {
      if (isSubscribed) {
        await disable();
        toast.success("Push notifikace vypnuty");
        return;
      }
      // requestPermission must run synchronously in the click handler (iOS Safari)
      const perm =
        "Notification" in window ? await Notification.requestPermission() : ("denied" as NotificationPermission);
      const res = await enable(perm);
      if (res.ok) toast.success("Notifikace povoleny ✓");
      else toast.error(res.error || "Nepodařilo se povolit notifikace");
    };

    const handleRetry = async () => {
      if (denied) {
        toast.error(
          "Notifikace jsou zakázány v nastavení prohlížeče/telefonu. Povolte je ručně v Nastavení → Notifikace.",
        );
        return;
      }
      const perm =
        "Notification" in window ? await Notification.requestPermission() : ("denied" as NotificationPermission);
      const res = await enable(perm);
      if (res.ok) toast.success("Notifikace povoleny ✓");
      else toast.error(res.error || "Nepodařilo se povolit notifikace");
    };

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                <Bell className="h-5 w-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Push notifikace</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Stav: <span className="font-medium text-foreground">{statusLabel}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  {unsupported
                    ? "Tento prohlížeč push notifikace nepodporuje."
                    : denied
                    ? "Notifikace jsou zakázány v nastavení prohlížeče/telefonu. Povolte je ručně v Nastavení → Notifikace."
                    : isSubscribed
                    ? "Dostáváš notifikace na tomto zařízení."
                    : "Povol, ať tě upozorníme na schůzky, povýšení a důležité události."}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isSubscribed}
              onClick={handleToggle}
              disabled={isLoading || unsupported || denied}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: isSubscribed ? "hsl(var(--accent))" : "hsl(var(--muted))" }}
            >
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: isSubscribed ? "translateX(1.375rem)" : "translateX(0.25rem)" }}
              />
            </button>
          </div>

          {!unsupported && !(granted && isSubscribed) && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isLoading}
              className="mt-3 w-full px-3 py-2 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Znovu povolit notifikace
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
          Notifikace přicházejí na konkrétní zařízení a prohlížeč. Pokud se odhlásíš, push pro toto zařízení se zruší.
        </p>
      </div>
    );
  };

  const renderPredplatne = () => {
    const billing = ownerBilling;
    const memberCount = ownerMemberCount;
    const monthly = calcPrice(billing as any, memberCount);
    const status: "active" | "trial" | "unpaid" = (() => {
      if (!billing?.billing_start) return "trial";
      const now = new Date();
      if (billing.grandfathered_until && new Date(billing.grandfathered_until) >= now) return "active";
      const lastPaid = ownerPayments.find((p) => p.status === "paid");
      if (!lastPaid) return "unpaid";
      const days = (now.getTime() - new Date(lastPaid.paid_at).getTime()) / 86400000;
      return days < 35 ? "active" : "unpaid";
    })();

    if (!billing) {
      return (
        <p className="text-sm text-muted-foreground italic">
          Předplatné zatím není nastaveno. Kontaktuj prosím správce.
        </p>
      );
    }

    return (
      <div className="space-y-5">
        <div className="rounded-2xl p-4" style={{ background: "hsl(var(--muted))" }}>
          <div className="flex items-center justify-between">
            <div className="font-heading font-semibold text-foreground">
              {PLAN_LABELS[billing.plan]}
            </div>
            <StatusBadge status={status} />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-2xl font-heading font-bold text-foreground">
                {monthly.toLocaleString("cs-CZ")} Kč
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {memberCount} čl. · {billing.price_base} +{" "}
                {Math.max(0, memberCount - billing.users_included)} × {billing.price_per_user}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Grandfathered do</div>
              <div className="text-sm font-medium text-foreground mt-0.5">
                {billing.grandfathered_until
                  ? format(new Date(billing.grandfathered_until), "d. M. yyyy", { locale: csLocale })
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-heading font-semibold text-foreground mb-2">Historie plateb</h3>
          <PaymentsTable payments={ownerPayments} ownerId={user!.id} />
        </div>
      </div>
    );
  };

  const TABS = isOwner
    ? (["Profil", "Oznámení", "Předplatné"] as const)
    : (["Profil", "Oznámení"] as const);

  const tabContent: Array<() => JSX.Element> = isOwner
    ? [renderProfil, renderNotifikace, renderPredplatne]
    : [renderProfil, renderNotifikace];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="absolute inset-0"
        style={{ background: isDark ? "rgba(0,0,0,0.6)" : "rgba(0,85,95,0.35)", backdropFilter: "blur(2px)" }}
      />

      <div
        className="relative w-full max-w-2xl bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col rounded-2xl mx-4 md:mx-6"
        style={{
          maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h2 className="font-heading text-lg font-semibold text-foreground">Nastavení</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 pb-0 border-b border-border overflow-x-auto">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className="px-4 py-2.5 text-sm font-medium whitespace-nowrap -mb-px cursor-pointer transition-colors"
              style={{
                borderBottom: i === activeTab ? "2px solid #00555f" : "2px solid transparent",
                color: i === activeTab ? "#00555f" : "hsl(var(--muted-foreground))",
                fontWeight: i === activeTab ? 500 : 400,
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
          {tabContent[activeTab]()}

          {/* Logout button — mobile only */}
          <div className="md:hidden mt-6 pt-4 border-t border-border">
            <button
              onClick={signOut}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-destructive border border-destructive/30 hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Odhlásit se
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
