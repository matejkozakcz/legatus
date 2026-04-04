import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, ChevronDown, ChevronUp, Loader2, Link2, Unlink2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserIdentity } from "@supabase/supabase-js";

interface ProfileSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
};

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.26c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="#000">
    <path d="M13.545 8.82c-.022-2.26 1.845-3.345 1.929-3.396-1.05-1.536-2.685-1.746-3.266-1.77-1.39-.141-2.714.819-3.42.819-.705 0-1.796-.798-2.951-.777-1.518.022-2.917.883-3.698 2.243-1.577 2.736-.404 6.79 1.133 9.012.751 1.087 1.648 2.307 2.826 2.264 1.133-.046 1.562-.733 2.932-.733 1.37 0 1.755.733 2.953.71 1.22-.022 1.996-1.108 2.742-2.197.864-1.26 1.22-2.48 1.242-2.544-.027-.012-2.383-.915-2.408-3.63h.006Zm-2.26-6.672c.624-.757 1.045-1.808.93-2.856-.9.037-1.99.6-2.636 1.356-.58.67-1.087 1.74-.951 2.767 1.004.078 2.028-.51 2.657-1.267Z"/>
  </svg>
);

export function ProfileSettingsModal({ open, onClose }: ProfileSettingsModalProps) {
  const { user, profile, isAdmin, godMode, toggleGodMode } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchIdentities = useCallback(async () => {
    const { data } = await supabase.auth.getUserIdentities();
    if (data?.identities) {
      setIdentities(data.identities);
    }
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
      fetchIdentities();
    }
  }, [open, profile, fetchIdentities]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, handleEscape]);

  if (!open || !user || !profile) return null;

  const isProviderLinked = (provider: string) =>
    identities.some((i) => i.provider === provider);

  const handleLinkProvider = async (provider: "google" | "apple") => {
    setLinkingProvider(provider);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: window.location.origin + "/dashboard" },
      });
      if (error) throw error;
      // Redirect will happen — no further action needed
    } catch (err: any) {
      toast.error(err.message || `Nepodařilo se připojit ${PROVIDER_LABELS[provider]}`);
      setLinkingProvider(null);
    }
  };

  const handleUnlinkProvider = async (provider: string) => {
    // Must have at least 2 identities (email + 1 social, or 2 social) to unlink
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

  const initials = profile.full_name
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
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

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

  const handleSave = async () => {
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
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", user.id);

      if (profileError) throw profileError;

      if (showPassword && newPassword && newPassword === confirmPassword) {
        const { error: pwError } = await supabase.auth.updateUser({
          password: newPassword,
        });
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

  const renderProviderRow = (provider: "google" | "apple") => {
    const linked = isProviderLinked(provider);
    const isLinking = linkingProvider === provider;
    const isUnlinking = unlinkingProvider === provider;
    const Icon = provider === "google" ? GoogleIcon : AppleIcon;

    return (
      <div
        key={provider}
        className="flex items-center justify-between py-2.5"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#f0f5f6" }}>
            <Icon />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {PROVIDER_LABELS[provider]}
            </p>
            <p className="text-xs" style={{ color: linked ? "#00abbd" : "var(--text-muted)" }}>
              {linked ? "Připojeno" : "Nepřipojeno"}
            </p>
          </div>
        </div>
        {linked ? (
          <button
            onClick={() => handleUnlinkProvider(provider)}
            disabled={isUnlinking || identities.length <= 1}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
            style={{ borderColor: "#e2eaec", color: "#e05a50" }}
            title={identities.length <= 1 ? "Nelze odebrat poslední přihlašovací metodu" : "Odpojit"}
          >
            {isUnlinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink2 className="h-3.5 w-3.5" />}
            Odpojit
          </button>
        ) : (
          <button
            onClick={() => handleLinkProvider(provider)}
            disabled={!!linkingProvider}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
            style={{ borderColor: "#e2eaec", color: "#00abbd" }}
          >
            {isLinking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Připojit
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <h2
          className="font-heading text-lg font-semibold mb-6"
          style={{ color: "#0A2126" }}
        >
          Nastavení profilu
        </h2>

        {/* SECTION 1 — Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="relative w-20 h-20 rounded-full cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "hsl(var(--deep))" }}
              >
                <span className="text-xl font-heading font-semibold text-white">
                  {initials}
                </span>
              </div>
            )}
            {/* Camera overlay */}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-5" />

        {/* SECTION 2 — Name */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Jméno
            </label>
            <input
              type="text"
              value={jmeno}
              onChange={(e) => setJmeno(e.target.value)}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Příjmení
            </label>
            <input
              type="text"
              value={prijmeni}
              onChange={(e) => setPrijmeni(e.target.value)}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-5" />

        {/* SECTION 3 — Connected accounts */}
        <div className="mb-5">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Propojené účty
          </p>
          <div className="space-y-1">
            {renderProviderRow("google")}
            {renderProviderRow("apple")}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border mb-5" />

        {/* SECTION 4 — Password */}
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
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          {showPassword ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          Změnit heslo
        </button>

        {showPassword && (
          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Nové heslo
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError("");
                }}
                placeholder="Min. 8 znaků"
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Potvrdit heslo
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordError("");
                }}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {passwordError && (
              <p className="text-xs text-destructive">{passwordError}</p>
            )}
          </div>
        )}

        {/* SECTION — God Mode (admin only) */}
        {isAdmin && (
          <>
            <div className="border-t border-border mb-5" />
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Zap
                  className="h-4 w-4"
                  style={{ color: godMode ? "#e05a50" : "var(--text-muted)" }}
                />
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    God Mode
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {godMode ? "Admin pohled aktivní" : "Zobrazuji vlastní data"}
                  </p>
                </div>
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={godMode}
                onClick={toggleGodMode}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: godMode ? "#e05a50" : "#d1dfe2",
                }}
              >
                <span
                  className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  style={{
                    transform: godMode ? "translateX(1.375rem)" : "translateX(0.25rem)",
                  }}
                />
              </button>
            </div>
          </>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary btn-md w-full flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Uložit změny
        </button>
      </div>
    </div>
  );
}
