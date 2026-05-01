import { useState, useRef, useEffect } from "react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { Camera, Loader2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { PersonPicker } from "@/components/PersonPicker";
import { toast } from "sonner";
import { sendNotification } from "@/lib/notifications";
import legatusLogo from "@/assets/legatus-logo-light.png";

interface OnboardingModalProps {
  open: boolean;
}

interface VedouciOption {
  id: string;
  label: string;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
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
  const [prefilled, setPrefilled] = useState(false);

  // Workspace context (set when user joined via workspace invite link)
  const [orgUnitId, setOrgUnitId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [workspaceHasOwner, setWorkspaceHasOwner] = useState<boolean>(true);

  // Step 1 fields (hierarchy + role)
  const [vedouciId, setVedouciId] = useState("");
  const [ziskatelId, setZiskatelId] = useState("");
  const [ziskatelNotInSystem, setZiskatelNotInSystem] = useState(false);
  const [ziskatelName, setZiskatelName] = useState("");

  // Step 2 fields (optional)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [partnersId, setPartnersId] = useState("");

  // Read-only — full_name comes from signup on /join
  const [fullName, setFullName] = useState("");

  // Pre-fill from existing profile data (reactivation with keepData=true)
  useEffect(() => {
    if (!open || !user || prefilled) return;
    supabase
      .from("profiles")
      .select("full_name, vedouci_id, ziskatel_id, ziskatel_name, avatar_url, role, osobni_id, org_unit_id")
      .eq("id", user.id)
      .single()
      .then(async ({ data }) => {
        if (!data) return;
        setPrefilled(true);
        if (data.full_name && data.full_name !== user.email) setFullName(data.full_name);
        if (data.vedouci_id) setVedouciId(data.vedouci_id);
        if (data.ziskatel_id) setZiskatelId(data.ziskatel_id);
        if (data.ziskatel_name) {
          setZiskatelNotInSystem(true);
          setZiskatelName(data.ziskatel_name);
        }
        if (data.avatar_url) setAvatarUrl(data.avatar_url);
        if (data.role && data.role !== "novacek") setSelectedRole(data.role);
        if (data.osobni_id) setPartnersId(data.osobni_id);
        if (data.org_unit_id) {
          setOrgUnitId(data.org_unit_id);
          const { data: ws } = await supabase
            .from("org_units")
            .select("name, owner_id")
            .eq("id", data.org_unit_id)
            .maybeSingle();
          if (ws) {
            setWorkspaceName(ws.name);
            setWorkspaceHasOwner(!!ws.owner_id);
          }
        }
      });
  }, [open, user, prefilled]);

  // Step 2 fields
  const [historickyVykon, setHistorickyVykon] = useState("");
  const [selectedRole, setSelectedRole] = useState("ziskatel");

  const [saving, setSaving] = useState(false);

  const [vedouciOptions, setVedouciOptions] = useState<VedouciOption[]>([]);
  const [memberOptions, setMemberOptions] = useState<VedouciOption[]>([]);

  // Promotion rules from app_config (with sensible fallbacks)
  const [promoRules, setPromoRules] = useState({
    ziskatel_to_garant: { min_bj: 1000, min_structure: 2 },
    garant_to_bv: { min_structure: 5, min_direct: 3 },
    bv_to_vedouci: { min_structure: 10, min_direct: 6 },
  });

  // Fetch vedouci list (scoped to workspace if user is in one)
  useEffect(() => {
    if (!open) return;
    (async () => {
      let query = supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("is_active", true);

      if (orgUnitId) {
        // Inside a workspace: allow picking any active leader-ish member
        // already in the workspace. If the workspace has no owner yet,
        // we also allow picking "myself" (handled visually elsewhere) by
        // simply showing existing members. The current user can also pick
        // themselves implicitly by selecting role=vedouci on step 2.
        query = query
          .eq("org_unit_id", orgUnitId)
          .in("role", ["vedouci", "budouci_vedouci", "garant"]);
      } else {
        query = query.eq("role", "vedouci");
      }

      const { data } = await query;
      if (data) {
        setVedouciOptions(
          data
            .filter((p) => p.id !== user?.id)
            .map((p) => ({ id: p.id, label: p.full_name }))
        );
      }
    })();

    supabase
      .from("app_config")
      .select("value")
      .eq("key", "promotion_rules")
      .single()
      .then(({ data }) => {
        if (data?.value) {
          setPromoRules((prev) => ({ ...prev, ...(data.value as unknown as typeof prev) }));
        }
      });
  }, [open, orgUnitId, user?.id]);

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
      const { resizeImage } = await import("@/lib/imageResize");
      const compressed = await resizeImage(file, 800, 0.85);
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
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

  // First leader of an empty workspace: nobody to pick as Vedoucí.
  // Trigger when user joined a workspace without owner AND there are
  // no other leader-ish members yet to choose from.
  const isFirstLeaderOfWorkspace =
    !!orgUnitId && !workspaceHasOwner && vedouciOptions.length === 0;

  // Auto-set role to vedouci if first leader (they have no other option).
  useEffect(() => {
    if (isFirstLeaderOfWorkspace && selectedRole !== "vedouci") {
      setSelectedRole("vedouci");
    }
  }, [isFirstLeaderOfWorkspace, selectedRole]);

  const handleStep1Next = () => {
    if (!isFirstLeaderOfWorkspace && !vedouciId) {
      toast.error("Vyberte svého vedoucího.");
      return;
    }
    if (!isFirstLeaderOfWorkspace && !ziskatelNotInSystem && !ziskatelId) {
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
      const effectiveVedouciId = isFirstLeaderOfWorkspace ? null : vedouciId || null;
      const finalZiskatelId = isFirstLeaderOfWorkspace
        ? null
        : (ziskatelNotInSystem ? effectiveVedouciId : ziskatelId);

      const { error } = await supabase
        .from("profiles")
        .update({
          vedouci_id: effectiveVedouciId,
          garant_id: effectiveVedouciId,
          ziskatel_id: finalZiskatelId,
          ziskatel_name: ziskatelNotInSystem ? ziskatelName.trim() || null : null,
          avatar_url: avatarUrl,
          role: selectedRole,
          osobni_id: partnersId.trim() || null,
          onboarding_completed: true,
        })
        .eq("id", user.id);

      if (error) throw error;

      // If this user just became the first leader of an owner-less workspace,
      // promote them to workspace owner.
      if (isFirstLeaderOfWorkspace && orgUnitId) {
        await supabase
          .from("org_units")
          .update({ owner_id: user.id })
          .eq("id", orgUnitId)
          .is("owner_id", null);
      }

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



      // Fire notification trigger (best-effort, never blocks UI)
      sendNotification("onboarding_completed", {
        subjectUserId: user.id,
        senderUserId: user.id,
        variables: {
          new_role: selectedRole,
        },
      });

      await refetchProfile();
      toast.success("Účet nastaven!");
    } catch (err: any) {
      toast.error(err.message || "Chyba při ukládání.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const selectedRoleLabel = ROLE_OPTIONS.find((r) => r.value === selectedRole)?.label ?? "";
  const bjNumber = parseFloat(historickyVykon);
  const vedouciLabel = isFirstLeaderOfWorkspace
    ? "—"
    : (vedouciOptions.find((v) => v.id === vedouciId)?.label ?? "—");
  const ziskatelLabel = isFirstLeaderOfWorkspace
    ? "—"
    : ziskatelNotInSystem
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

        {/* ── STEP 1: Hierarchy + role ── */}
        {step === 1 && (
          <div className="w-full space-y-5">
            {isFirstLeaderOfWorkspace ? (
              <div
                className="rounded-xl p-3 text-xs font-body"
                style={{
                  background: "rgba(0,171,189,0.08)",
                  border: "1px solid rgba(0,171,189,0.25)",
                  color: "var(--text-primary)",
                }}
              >
                Jsi první v workspace <strong>{workspaceName}</strong> — automaticky se
                staneš jeho <strong>Vedoucím</strong>. Další členy přidáš později přes
                pozvánkový odkaz.
              </div>
            ) : (
              <>
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
              </>
            )}

            {/* Role selection */}
            <div>
              <label className="block font-body mb-2" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Tvoje aktuální pozice
              </label>
              <div className="flex flex-col gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const isSelected = selectedRole === opt.value;
                  let criteria = "";
                  if (opt.value === "ziskatel") {
                    criteria = "Splněná supervize";
                  } else if (opt.value === "garant") {
                    criteria = `${promoRules.ziskatel_to_garant.min_bj} BJ · ${promoRules.ziskatel_to_garant.min_structure} ve struktuře`;
                  } else if (opt.value === "budouci_vedouci") {
                    criteria = `${promoRules.garant_to_bv.min_structure} ve struktuře · ${promoRules.garant_to_bv.min_direct} přímí`;
                  } else if (opt.value === "vedouci") {
                    criteria = `${promoRules.bv_to_vedouci.min_structure} ve struktuře · ${promoRules.bv_to_vedouci.min_direct} přímých`;
                  }
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedRole(opt.value)}
                      className="w-full font-body transition-all"
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
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        textAlign: "left",
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>{opt.label}</span>
                      {criteria && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: isSelected ? "#00abbd" : "#7a9ba0",
                            opacity: isSelected ? 0.9 : 0.85,
                            textAlign: "right",
                            lineHeight: 1.25,
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                        >
                          {criteria}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
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

        {/* ── STEP 2: Optional details (avatar + Partners ID + historical BJ) ── */}
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

            <p className="font-body text-center text-xs" style={{ color: "var(--text-muted)" }}>
              Doplňující informace — vše je nepovinné, můžeš doplnit později.
            </p>

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
                  <img src={avatarUrl} alt="Avatar" loading="lazy" className="w-full h-full object-cover" />
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

            {/* Partners ID */}
            <div>
              <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                Partners ID
              </label>
              <input
                type="text"
                value={partnersId}
                onChange={(e) => setPartnersId(e.target.value)}
                placeholder="Např. P12345 (nepovinné)"
                className="w-full font-body"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <p className="font-body mt-1" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Vyplň, jakmile ti bude přiděleno. Aktivuje tě jako Získatele.
              </p>
            </div>

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
                  <img src={avatarUrl} alt="Avatar" loading="lazy" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-heading font-bold text-white text-xl">
                    {(fullName.trim().split(" ").map((p) => p[0]).join("").slice(0, 2) || "??").toUpperCase()}
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
                { label: "Jméno", value: fullName || "—" },
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
