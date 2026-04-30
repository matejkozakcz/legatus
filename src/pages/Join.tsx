import { useEffect, useState } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import legatusLogo from "@/assets/legatus-logo-light.png";

const loginBg = "/login-bg.svg";

interface Invite {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  org_unit_id: string | null;
  garant_id: string | null;
  expires_at: string;
  used_at: string | null;
}

export default function Join() {
  const { token } = useParams<{ token: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState<string>("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setLoadError("Chybí token pozvánky");
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("invites")
        .select("id, email, full_name, role, org_unit_id, garant_id, expires_at, used_at")
        .eq("token", token)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setLoadError("Pozvánka je neplatná nebo vypršela");
      } else if (data.used_at) {
        setLoadError("Tato pozvánka již byla použita");
      } else if (new Date(data.expires_at).getTime() < Date.now()) {
        setLoadError("Platnost pozvánky vypršela");
      } else {
        setInvite(data as Invite);
        setFullName(data.full_name ?? "");
        setEmail(data.email ?? "");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // If user is already logged in, just send them to dashboard
  if (session && !submitting) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!invite) return;
    if (!fullName.trim()) return setError("Zadej jméno");
    if (!email.trim()) return setError("Zadej e-mail");
    if (password.length < 8) return setError("Heslo musí mít alespoň 8 znaků");
    if (password !== confirmPassword) return setError("Hesla se neshodují");

    setSubmitting(true);
    try {
      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: fullName.trim(), role: invite.role },
        },
      });
      if (signUpErr) throw signUpErr;
      const userId = authData.user?.id;
      if (!userId) throw new Error("Registrace selhala");

      // Update profile with workspace + garant + name
      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          org_unit_id: invite.org_unit_id,
          garant_id: invite.garant_id,
          full_name: fullName.trim(),
        })
        .eq("id", userId);
      if (profErr) throw profErr;

      // Mark invite used
      await supabase
        .from("invites")
        .update({ used_at: new Date().toISOString() })
        .eq("id", invite.id);

      // Ensure session
      if (!authData.session) {
        await supabase.auth.signInWithPassword({ email: email.trim(), password });
      }

      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.message ?? "Něco se nepovedlo");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#00555f",
      }}
    >
      <div className="relative z-10 w-full max-w-[440px] mx-4 flex flex-col items-center">
        <img src={legatusLogo} alt="Legatus" className="h-12 mb-6" />

        <div
          className="w-full rounded-3xl p-8 shadow-2xl"
          style={{ backgroundColor: "#ffffff" }}
        >
          {loading ? (
            <p className="text-center font-heading" style={{ color: "#00555f" }}>
              Načítání pozvánky…
            </p>
          ) : loadError ? (
            <div className="text-center space-y-4">
              <h1 className="font-heading font-bold text-xl" style={{ color: "#00555f" }}>
                Pozvánka neplatná
              </h1>
              <p className="text-sm" style={{ color: "#5a7378" }}>
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="w-full h-11 rounded-xl font-heading font-semibold text-white"
                style={{ backgroundColor: "#00abbd" }}
              >
                Přejít na přihlášení
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <h1 className="font-heading font-bold text-xl" style={{ color: "#00555f" }}>
                  Vytvořit účet
                </h1>
                <p className="text-sm mt-1" style={{ color: "#5a7378" }}>
                  Byl jsi pozván do Legata
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#00555f" }}>
                  Celé jméno
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border outline-none"
                  style={{ borderColor: "#cdd9db", color: "#0c2226" }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#00555f" }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border outline-none"
                  style={{ borderColor: "#cdd9db", color: "#0c2226" }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#00555f" }}>
                  Heslo
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full h-11 px-3 pr-10 rounded-xl border outline-none"
                    style={{ borderColor: "#cdd9db", color: "#0c2226" }}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "#5a7378" }}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#00555f" }}>
                  Potvrzení hesla
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border outline-none"
                  style={{ borderColor: "#cdd9db", color: "#0c2226" }}
                  required
                  minLength={8}
                />
              </div>

              {error && (
                <p className="text-sm text-center" style={{ color: "#fc7c71" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl font-heading font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#fc7c71" }}
              >
                {submitting ? "Vytváření účtu…" : "Vytvořit účet"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
