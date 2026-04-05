import { useState, useRef, useEffect } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { Camera, Loader2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { PersonPicker } from "@/components/PersonPicker";
import { toast } from "sonner";
import legatusLogo from "@/assets/legatus-logo-light.png";

interface OnboardingModalProps {
  open: boolean;
}

interface VedouciOption {
  id: string;
  label: string;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "novacek", label: "Nováček" },
  { value: "ziskatel", label: "Získatel" },
  { value: "garant", label: "Garant" },
  { value: "budouci_vedouci", label: "Budoucí vedoucí" },
  { value: "vedouci", label: "Vedoucí" },
];

// First Monday of December 2025
const HISTORICAL_WEEK_START = "2025-12-01";

export function OnboardingModal({ open }: OnboardingModalProps) {
  useBodyScrollLock(open);
  const { user, refetchProfile } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);

  // Step 1 fields
  const [jmeno, setJmeno] = useState("");
  const [prijmeni, setPrijmeni] = useState("");
  const [vedouciId, setVedouciId] = useState("");
  const [ziskatelId, setZiskatelId] = useState("");
  const [ziskatelNotInSystem, setZiskatelNotInSystem] = useState(false);
  const [ziskatelName, setZiskatelName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Step 2 fields
  const [historickyVykon, setHistorickyVykon] = useState("");
  const [selectedRole, setSelectedRole] = useState("novacek");

  const [saving, setSaving] = useState(false);

  const [vedouciOptions, setVedouciOptions] = useState<VedouciOption[]>([]);
  const [memberOptions, setMemberOptions] = useState<VedouciOption[]>([]);

  // Fetch vedouci list
  useEffect(() => {
    if (!open) return;
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "vedouci")
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          setVedouciOptions(data.map((p) => ({ id: p.id, label: p.full_name })));
        }
      });
  }, [open]);

  // Fetch members under selected vedouci for ziskatel picker
  useEffect(() => {
    if (!vedouciId) {
      setMemberOptions([]);
      return;
    }
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("vedouci_id", vedouciId)
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          const vedouci = vedouciOptions.find((v) => v.id === vedouciId);
          const options = data
            .filter((p) => p.id !== user?.id)
            .map((p) => ({ id: p.id, label: p.full_name }));
          if (vedouci) {
            options.unshift({ id: vedouci.id, label: vedouci.label });
          }
          const seen = new Set<string>();
          setMemberOptions(options.filter((o) => {
            if (seen.has(o.id)) return false;
            seen.add(o.id);
            return true;
          }));
        }
      });
  }, [vedouciId, vedouciOptions, user?.id]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
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
      setAvatarUrl(urlData.publicUrl);
    } catch (err: any) {
      toast.error(err.message || "Chyba při nahrávání fotky");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleStep1Next = () => {
    if (!jmeno.trim() || !prijmeni.trim()) {
      toast.error("Vyplňte jméno a příjmení.");
      return;
    }
    if (!vedouciId) {
      toast.error("Vyberte svého vedoucího.");
      return;
    }
    if (!ziskatelNotInSystem && !ziskatelId) {
      toast.error("Vyberte získatele nebo zaškrtněte, že není v systému.");
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const fullName = `${jmeno.trim()} ${prijmeni.trim()}`;
      const finalZiskatelId = ziskatelNotInSystem ? vedouciId : ziskatelId;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          vedouci_id: vedouciId,
          garant_id: vedouciId,
          ziskatel_id: finalZiskatelId,
          ziskatel_name: ziskatelNotInSystem ? ziskatelName.trim() || null : null,
          avatar_url: avatarUrl,
          role: selectedRole,
          onboarding_completed: true,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Save historical BJ as December 2025 activity record
      const bjValue = parseFloat(historickyVykon);
      if (!isNaN(bjValue) && bjValue > 0) {
        await supabase
          .from("activity_records")
          .upsert(
            {
              user_id: user.id,
              week_start: HISTORICAL_WEEK_START,
              bj: bjValue,
            },
            { onConflict: "user_id,week_start" }
          );
      }

      await refetchProfile();
      toast.success("Účet nastaven!");
    } catch (err: any) {
      toast.error(err.message || "Chyba při ukládání.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const fullName = `${jmeno.trim()} ${prijmeni.trim()}`.trim();
  const selectedRoleLabel = ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label ?? "";
  const bjNumber = parseFloat(historickyVykon);
  const vedouciLabel = vedouciOptions.find((v) => v.id === vedouciId)?.label ?? "—";
  const ziskatelLabel = ziskatelNotInSystem
    ? (ziskatelName.trim() || "—")
    : (memberOptions.find((m) => m.id === ziskatelId)?.label ?? "—");

  // Shared input style
  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.06)" : "#ffffff",
    border: isDark ? "1.5px solid rgba(255,255,255,0.12)" : "1.5px solid #e2eaec",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    color: "var(--text-primary)",
    outline: "none",
  } as React.CSSProperties;

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "#00abbd";
    e.target.style.boxShadow = "0 0 0 3px rgba(0,171,189,0.12)";
  };
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = isDark ? "rgba(255,255,255,0.12)" : "#e2eaec";
    e.target.style.boxShadow = "none";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: isDark ? "rgba(0,0,0,0.65)" : "rgba(0,85,95,0.35)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="w-full max-w-[440px] mx-4 flex flex-col items-center overflow-y-auto"
        style={{
          maxHeight:
            "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 32px)",
          background: isDark ? "hsl(188,18%,18%)" : "#ffffff",
          borderRadius: 28,
          boxShadow: isDark
            ? "0 8px 48px rgba(0,0,0,0.5)"
            : "0 8px 32px rgba(0,85,95,0.22)",
          border: isDark ? "1px solid rgba(255,255,255,0.08)" : "none",
          padding: "32px",
          paddingBottom: "max(32px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <img src={legatusLogo} alt="Legatus" className="h-12 mb-1" />
        <h2
          className="font-heading font-bold text-base mb-1"
          style={{ letterSpacing: "0.12em", color: "var(--text-primary)" }}
        >
          NASTAVENÍ ÚČTU
        </h2>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: s === step ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: s === step ? "#00abbd" : s < step ? "#22c55e" : isDark ? "rgba(255,255,255,0.15)" : "#e2eaec",
                transition: "all 0.25s",
              }}
            />
          ))}
        </div>

        {/* ── STEP 1: Basic info ── */}
        {step === 1 && (
          <div className="w-full space-y-5">
            {/* Avatar */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-20 h-20 rounded-full overflow-hidden border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: avatarUrl ? "#00abbd" : "#e2eaec",
                  background: avatarUrl ? "transparent" : "#f0f5f6",
                }}
              >
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#00abbd" }} />
                ) : avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <Camera className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                    <span className="text-[10px] font-body" style={{ color: "var(--text-muted)" }}>Foto</span>
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            {/* Name fields */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Jméno
                </label>
                <input
                  type="text"
                  value={jmeno}
                  onChange={(e) => setJmeno(e.target.value)}
                  placeholder="Jan"
                  className="w-full font-body"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
              <div className="flex-1">
                <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Příjmení
                </label>
                <input
                  type="text"
                  value={prijmeni}
                  onChange={(e) => setPrijmeni(e.target.value)}
                  placeholder="Novák"
                  className="w-full font-body"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>

            {/* Vedouci picker */}
            <div>
              <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Vedoucí
              </label>
              <PersonPicker
                value={vedouciId}
                onChange={(id) => {
                  setVedouciId(id);
                  setZiskatelId("");
                }}
                options={vedouciOptions}
                placeholder="Vyberte vedoucího..."
                required
              />
            </div>

            {/* Ziskatel picker */}
            <div>
              <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Získatel
              </label>
              {!ziskatelNotInSystem ? (
                <PersonPicker
                  value={ziskatelId}
                  onChange={setZiskatelId}
                  options={memberOptions}
                  placeholder={vedouciId ? "Vyberte získatele..." : "Nejdřív vyberte vedoucího"}
                  required={!ziskatelNotInSystem}
                />
              ) : (
                <input
                  type="text"
                  value={ziskatelName}
                  onChange={(e) => setZiskatelName(e.target.value)}
                  placeholder="Jméno získatele"
                  className="w-full font-body"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              )}
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ziskatelNotInSystem}
                  onChange={(e) => {
                    setZiskatelNotInSystem(e.target.checked);
                    if (e.target.checked) setZiskatelId("");
                    else setZiskatelName("");
                  }}
                  className="rounded"
                  style={{ accentColor: "#00abbd" }}
                />
                <span className="font-body text-xs" style={{ color: "#5a8a91" }}>
                  Získatel není v systému
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleStep1Next}
              className="w-full btn btn-primary btn-lg font-heading font-semibold"
            >
              Pokračovat
            </button>
          </div>
        )}

        {/* ── STEP 2: Historical performance + role ── */}
        {step === 2 && (
          <div className="w-full space-y-5">
            {/* Back button */}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 font-body text-sm"
              style={{ color: "#5a8a91", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <ChevronLeft className="w-4 h-4" />
              Zpět
            </button>

            {/* Historical BJ */}
            <div>
              <label className="block font-body mb-1" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Historický výkon v BJ
              </label>
              <p className="font-body mb-2" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Celkový počet BJ, které sis doposud vydělal/a. Bude přičten za Prosinec 2025.
              </p>
              <input
                type="number"
                min="0"
                step="1"
                value={historickyVykon}
                onChange={(e) => setHistorickyVykon(e.target.value)}
                placeholder="0"
                className="w-full font-body"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {/* Role selection */}
            <div>
              <label className="block font-body mb-2" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Tvoje aktuální pozice
              </label>
              <div className="flex flex-col gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = selectedRole === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedRole(opt.value)}
                      className="w-full text-left font-body transition-all"
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: isSelected
                          ? "2px solid #00abbd"
                          : isDark
                          ? "2px solid rgba(255,255,255,0.10)"
                          : "2px solid #e2eaec",
                        background: isSelected
                          ? isDark
                            ? "rgba(0,171,189,0.14)"
                            : "rgba(0,171,189,0.08)"
                          : isDark
                          ? "rgba(255,255,255,0.04)"
                          : "#f9fbfb",
                        color: isSelected ? "#00abbd" : "var(--text-primary)",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={handleStep2Next}
              className="w-full btn btn-primary btn-lg font-heading font-semibold"
            >
              Pokračovat
            </button>
          </div>
        )}

        {/* ── STEP 3: Summary + confirm ── */}
        {step === 3 && (
          <div className="w-full space-y-5">
            {/* Back button */}
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1 font-body text-sm"
              style={{ color: "#5a8a91", background: "none", border: "none", padding: 0, cursor: "pointer" }}
            >
              <ChevronLeft className="w-4 h-4" />
              Zpět
            </button>

            {/* Avatar preview */}
            <div className="flex justify-center">
              <div
                className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
                style={{
                  background: avatarUrl ? "transparent" : "#00abbd",
                  border: "3px solid #00abbd",
                }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-heading font-bold text-white text-xl">
                    {jmeno[0]?.toUpperCase()}{prijmeni[0]?.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Summary rows */}
            <div
              className="w-full rounded-xl overflow-hidden"
              style={{
                border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid #e2eaec",
              }}
            >
              {[
                { label: "Jméno", value: fullName },
                { label: "Email", value: user?.email ?? "" },
                { label: "Pozice", value: selectedRoleLabel },
                { label: "Vedoucí", value: vedouciLabel },
                { label: "Získatel", value: ziskatelLabel },
                { label: "Historický výkon", value: !isNaN(bjNumber) && bjNumber > 0 ? `${bjNumber} BJ` : "—" },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  className="flex justify-between items-center"
                  style={{
                    padding: "12px 16px",
                    borderBottom: i < arr.length - 1
                      ? isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #f0f4f5"
                      : "none",
                    background: isDark ? "rgba(255,255,255,0.03)" : "#fafcfc",
                  }}
                >
                  <span className="font-body text-xs" style={{ color: "var(--text-muted)" }}>{row.label}</span>
                  <span className="font-body text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{row.value}</span>
                </div>
              ))}
            </div>

            <p className="font-body text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Zkontroluj své údaje a potvrď vstup do Legatus.
            </p>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full btn btn-primary btn-lg disabled:opacity-50 font-heading font-semibold"
            >
              {saving ? "Ukládám..." : "Vstoupit do Legatus"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
