import { useState, useEffect, useRef, useCallback } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { X, Camera, ChevronDown, ChevronUp, Loader2, Link2, Unlink2, Zap, CalendarX, Puzzle, LogOut, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registerPushSubscription } from "@/lib/pushSubscription";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserIdentity } from "@supabase/supabase-js";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: number;
}

const TABS = ["Profil", "Oznámení", "Kalendář", "gOWL"] as const;

const PROVIDER_LABELS: Record<string, string> = { google: "Google", apple: "Apple" };

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      fill="#34A853"
    />
    <path
      d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      fill="#EA4335"
    />
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M13.545 8.82c-.022-2.26 1.845-3.345 1.929-3.396-1.05-1.536-2.685-1.746-3.266-1.77-1.39-.141-2.714.819-3.42.819-.705 0-1.796-.798-2.951-.777-1.518.022-2.917.883-3.698 2.243-1.577 2.736-.404 6.79 1.133 9.012.751 1.087 1.648 2.307 2.826 2.264 1.133-.046 1.562-.733 2.932-.733 1.37 0 1.755.733 2.953.71 1.22-.022 1.996-1.108 2.742-2.197.864-1.26 1.22-2.48 1.242-2.544-.027-.012-2.383-.915-2.408-3.63h.006Zm-2.26-6.672c.624-.757 1.045-1.808.93-2.856-.9.037-1.99.6-2.636 1.356-.58.67-1.087 1.74-.951 2.767 1.004.078 2.028-.51 2.657-1.267Z" />
  </svg>
);

const NOTIF_STORAGE_KEY = "legatus_notification_prefs";

interface NotifPrefs {
  meetingReminder: boolean;
  meetingReminderCount: number;
  meetingReminderBefore: string;
  postMeeting: boolean;
  postMeetingDelay: string;
  shareGarant: boolean;
  deadlineAlert: boolean;
  deadlineDaysBefore: number;
}

const defaultNotifPrefs: NotifPrefs = {
  meetingReminder: false,
  meetingReminderCount: 1,
  meetingReminderBefore: "30min",
  postMeeting: false,
  postMeetingDelay: "ihned",
  shareGarant: false,
  deadlineAlert: false,
  deadlineDaysBefore: 3,
};

function loadNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (raw) return { ...defaultNotifPrefs, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultNotifPrefs };
}

export function SettingsModal({ open, onClose, initialTab = 0 }: SettingsModalProps) {
  useBodyScrollLock(open);
  const { user, profile, isAdmin, godMode, toggleGodMode, signOut } = useAuth();
  const { theme } = useTheme();
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
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

  // Oznámení
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(defaultNotifPrefs);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );

  const fetchIdentities = useCallback(async () => {
    const { data } = await supabase.auth.getUserIdentities();
    if (data?.identities) setIdentities(data.identities);
  }, []);

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
      fetchIdentities();
      setNotifPrefs(loadNotifPrefs());
    }
  }, [open, profile, fetchIdentities, initialTab]);

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

  if (!open || !user || !profile) return null;

  const initials =
    profile.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";
  const isProviderLinked = (provider: string) => identities.some((i) => i.provider === provider);

  const handleLinkProvider = async (provider: "google" | "apple") => {
    setLinkingProvider(provider);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || `Nepodařilo se připojit ${PROVIDER_LABELS[provider]}`);
      setLinkingProvider(null);
    }
  };

  const handleUnlinkProvider = async (provider: string) => {
    if (identities.length <= 1) {
      toast.error("Nelze odebrat poslední přihlašovací metodu.");
      return;
    }
    const identity = identities.find((i) => i.provider === provider);
    if (!identity) return;
    setUnlinkingProvider(provider);
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      await fetchIdentities();
      toast.success(`${PROVIDER_LABELS[provider] || provider} odpojen`);
    } catch (err: any) {
      toast.error(err.message || `Nepodařilo se odpojit ${PROVIDER_LABELS[provider] || provider}`);
    } finally {
      setUnlinkingProvider(null);
    }
  };

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

  const handleSaveNotifications = () => {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifPrefs));
    toast.success("Nastavení notifikací uloženo");
    onClose();
  };

  const updateNotif = (patch: Partial<NotifPrefs>) => setNotifPrefs((prev) => ({ ...prev, ...patch }));

  const renderProviderRow = (provider: "google" | "apple") => {
    const linked = isProviderLinked(provider);
    const isLinking = linkingProvider === provider;
    const isUnlinking = unlinkingProvider === provider;
    const Icon = provider === "google" ? GoogleIcon : AppleIcon;
    return (
      <div key={provider} className="flex items-center justify-between py-2.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted">
            <Icon />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{PROVIDER_LABELS[provider]}</p>
            <p className={`text-xs ${linked ? "text-secondary" : "text-muted-foreground"}`}>
              {linked ? "Připojeno" : "Nepřipojeno"}
            </p>
          </div>
        </div>
        {linked ? (
          <button
            onClick={() => handleUnlinkProvider(provider)}
            disabled={isUnlinking || identities.length <= 1}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-destructive transition-colors disabled:opacity-40"
          >
            {isUnlinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink2 className="h-3.5 w-3.5" />}
            Odpojit
          </button>
        ) : (
          <button
            onClick={() => handleLinkProvider(provider)}
            disabled={!!linkingProvider}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border text-secondary transition-colors disabled:opacity-40"
          >
            {isLinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Připojit
          </button>
        )}
      </div>
    );
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
            <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover" />
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

      {/* OAuth */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">Propojené účty</p>
        <div className="space-y-1">
          {renderProviderRow("google")}
          {renderProviderRow("apple")}
        </div>
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


  const handleRequestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === "granted") {
      toast.success("Oznámení povolena");
      // Register push subscription
      if (user) {
        registerPushSubscription(user.id);
      }
    } else if (result === "denied") {
      toast.error("Oznámení byla zamítnuta. Povolit je můžeš v nastavení prohlížeče.");
    }
  };

  const renderNotifikace = () => (
    <div className="space-y-1">
      {/* Permission banner */}
      {notifPermission !== "granted" && (
        <div className="mb-4 p-4 rounded-xl border border-border bg-muted/50">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Oznámení nejsou povolena</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {notifPermission === "denied"
                  ? "Oznámení jsi zablokoval/a v prohlížeči. Povol je v nastavení prohlížeče."
                  : "Pro příjem připomínek a upozornění povol oznámení."}
              </p>
              <button
                onClick={notifPermission === "denied" ? () => {
                  toast.info("Otevři nastavení prohlížeče → Oznámení a povol je pro tuto stránku.");
                } : handleRequestPermission}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                style={{
                  background: "hsl(var(--secondary))",
                  color: "white",
                }}
              >
                <Bell className="h-3.5 w-3.5" />
                Povolit oznámení
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Připomínka schůzky */}
      {renderToggleRow(
        "Připomínka schůzky",
        notifPrefs.meetingReminder,
        (v) => updateNotif({ meetingReminder: v }),
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">Kolikrát</label>
            <select
              value={notifPrefs.meetingReminderCount}
              onChange={(e) => updateNotif({ meetingReminderCount: Number(e.target.value) })}
              className={selectClass}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-muted-foreground mb-1">Jak moc předem</label>
            <select
              value={notifPrefs.meetingReminderBefore}
              onChange={(e) => updateNotif({ meetingReminderBefore: e.target.value })}
              className={selectClass}
            >
              <option value="15min">15 min</option>
              <option value="30min">30 min</option>
              <option value="1h">1 hodinu</option>
              <option value="1d">1 den</option>
              <option value="2d">2 dny</option>
            </select>
          </div>
        </div>,
      )}

      <div className="border-t border-border" />

      {/* Post-meeting prompt */}
      {renderToggleRow(
        "Tak jak dopadla schůzka? 😎",
        notifPrefs.postMeeting,
        (v) => updateNotif({ postMeeting: v }),
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Za jak dlouho po skončení</label>
          <select
            value={notifPrefs.postMeetingDelay}
            onChange={(e) => updateNotif({ postMeetingDelay: e.target.value })}
            className={selectClass}
          >
            <option value="ihned">Ihned</option>
            <option value="30min">Za 30 minut</option>
            <option value="1h">Za 1 hodinu</option>
          </select>
        </div>,
      )}

      <div className="border-t border-border" />

      {/* Sdílení garantovi */}
      {renderToggleRow("Sdílení garantovi", notifPrefs.shareGarant, (v) => updateNotif({ shareGarant: v }))}

      <div className="border-t border-border" />

      {/* Deadline */}
      {renderToggleRow(
        "Deadline upozornění",
        notifPrefs.deadlineAlert,
        (v) => updateNotif({ deadlineAlert: v }),
        <>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Dní před koncem období</label>
            <input
              type="number"
              min={1}
              max={14}
              value={notifPrefs.deadlineDaysBefore}
              onChange={(e) => updateNotif({ deadlineDaysBefore: Math.max(1, Number(e.target.value)) })}
              className={`${inputClass} w-24`}
            />
          </div>
          <p className="text-xs text-muted-foreground italic">
            Pokud máš stanovený cíl, upozornění se přizpůsobí tvému plnění.
          </p>
        </>,
      )}

      {/* Save */}
      <button
        onClick={handleSaveNotifications}
        className="btn btn-primary btn-md w-full flex items-center justify-center gap-2 mt-4"
      >
        Uložit nastavení
      </button>
    </div>
  );

  const renderPlaceholder = (icon: React.ReactNode, text: string) => (
    <div className="flex flex-col items-center justify-center py-16 opacity-50">
      {icon}
      <p className="text-sm text-muted-foreground mt-4 text-center">{text}</p>
    </div>
  );

  const tabContent = [
    renderProfil,
    renderNotifikace,
    () =>
      renderPlaceholder(
        <CalendarX className="h-10 w-10 text-muted-foreground" />,
        "Propojení s externím kalendářem bude dostupné brzy.",
      ),
    () => renderPlaceholder(<Puzzle className="h-10 w-10 text-muted-foreground" />, "Připravujeme propojení s gOWL."),
  ];

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
          {TABS.map((tab, i) => {
            const isDisabled = i >= 2;
            return (
              <button
                key={tab}
                onClick={() => !isDisabled && setActiveTab(i)}
                disabled={isDisabled}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px
                  ${i === activeTab ? "border-secondary text-secondary" : "border-transparent text-muted-foreground hover:text-foreground"}
                  ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
              >
                {tab}
              </button>
            );
          })}
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
