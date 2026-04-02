import { useState, useEffect, useRef, useCallback } from "react";
import { X, Camera, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface ProfileSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileSettingsModal({ open, onClose }: ProfileSettingsModalProps) {
  const { user, profile } = useAuth();
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
    }
  }, [open, profile]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-150"
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

        {/* SECTION 3 — Password */}
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
