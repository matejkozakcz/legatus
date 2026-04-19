import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import legatusLogo from "@/assets/legatus-logo-light.png";

const loginBg = "/login-bg.svg";

/**
 * Stránka pro nastavení hesla po kliknutí na invite / recovery link.
 *
 * Supabase JS SDK má defaultně zapnuté `detectSessionInUrl`, takže když
 * uživatel dorazí na `/set-password#access_token=...&type=invite`, SDK
 * automaticky nahraje session. Tady jen počkáme na session a pak
 * zavoláme `supabase.auth.updateUser({ password })`.
 *
 * Tato stránka je public route — záměrně NE-chráněná přes ProtectedRoute.
 */
const SetPassword = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // URL-hash se zpracovává automaticky (detectSessionInUrl=true).
    // Počkáme až na to a podíváme se na session.
    const init = async () => {
      // Případná chyba přímo v URL (expired, invalid token...)
      const hash = window.location.hash || "";
      const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
      const errParam = params.get("error_description") || params.get("error");
      if (errParam) {
        if (!mounted) return;
        setLinkError(decodeURIComponent(errParam));
        setLoading(false);
        return;
      }

      // Krátké čekání aby Supabase stihl zpracovat hash → session
      await new Promise((r) => setTimeout(r, 100));

      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session?.user) {
        setHasSession(true);
        setEmail(session.user.email ?? null);
      } else {
        // Žádná session → link je neplatný / vypršel / uživatel už prošel
        setLinkError(
          "Odkaz pro nastavení hesla není platný nebo vypršel. Požádej svého vedoucího o nové pozvání."
        );
      }
      setLoading(false);
    };

    init();

    // Pokud SDK zpracuje hash později, zareagujeme přes onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setHasSession(true);
        setEmail(session.user.email ?? null);
        setLinkError(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Heslo musí mít alespoň 6 znaků.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Hesla se neshodují.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message || "Nepodařilo se nastavit heslo.");
      return;
    }

    toast.success("Heslo bylo nastaveno. Vítej v Legatu!");
    // Odstraníme hash z URL (access_token apod.) a přejdeme na dashboard.
    // Dashboard přes AuthContext spustí onboarding pokud je potřeba.
    window.history.replaceState({}, document.title, "/dashboard");
    navigate("/dashboard", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#e1e9eb" }}>
        <div className="font-heading text-xl" style={{ color: "#00555f" }}>Načítání...</div>
      </div>
    );
  }

  // Neplatný / vypršelý link — žádná session se nevytvořila.
  if (linkError) {
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
        <div
          className="relative z-10 w-full max-w-[440px] mx-4 flex flex-col items-center"
          style={{
            background: "#ffffff",
            borderRadius: "28px",
            boxShadow: "0 8px 32px rgba(0,85,95,0.22)",
            padding: "40px 32px",
          }}
        >
          <img src={legatusLogo} alt="Legatus" className="h-10 mb-6" />
          <h2 className="font-heading font-bold text-xl mb-3" style={{ color: "#00555f" }}>
            Odkaz není platný
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: "#6b7280" }}>
            {linkError}
          </p>
          <button
            onClick={() => navigate("/login", { replace: true })}
            className="w-full btn btn-primary btn-lg font-heading font-semibold"
          >
            Přejít na přihlášení
          </button>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    // Fallback — nemělo by se dít, ale pro jistotu
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#00555F",
      }}
    >
      <div
        className="relative z-10 w-full max-w-[420px] mx-4 flex flex-col items-center"
        style={{
          background: "#ffffff",
          borderRadius: "28px",
          boxShadow: "0 8px 32px rgba(0,85,95,0.22)",
          padding: "32px",
        }}
      >
        <img src={legatusLogo} alt="Legatus" className="h-14 mb-2" />
        <h1 className="font-heading font-bold text-lg mb-1" style={{ letterSpacing: "0.15em", color: "#0c2226" }}>
          LEGATUS
        </h1>
        <h2 className="font-heading font-semibold text-base mb-1 mt-4" style={{ color: "#00555f" }}>
          Nastav si heslo
        </h2>
        {email && (
          <p className="font-body text-sm text-center mb-6" style={{ color: "#6b7280" }}>
            Pro účet <strong style={{ color: "#0c2226" }}>{email}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}>
              Nové heslo
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="Minimálně 6 znaků"
                className="w-full font-body"
                style={{
                  background: "#ffffff",
                  border: "1.5px solid #e2eaec",
                  borderRadius: 8,
                  padding: "10px 14px",
                  paddingRight: 44,
                  fontSize: 14,
                  color: "#0c2226",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#00abbd";
                  e.target.style.boxShadow = "0 0 0 3px rgba(0,171,189,0.12)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#e2eaec";
                  e.target.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                style={{ color: "#8aadb3" }}
                aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}>
              Potvrzení hesla
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Znovu totéž"
              className="w-full font-body"
              style={{
                background: "#ffffff",
                border: "1.5px solid #e2eaec",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 14,
                color: "#0c2226",
                outline: "none",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#00abbd";
                e.target.style.boxShadow = "0 0 0 3px rgba(0,171,189,0.12)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e2eaec";
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {error && (
            <p className="font-body text-center" style={{ fontSize: 12, color: "#e05a50" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full btn btn-primary btn-lg disabled:opacity-50 font-heading font-semibold"
          >
            {submitting ? "Ukládám..." : "Nastavit heslo a pokračovat"}
          </button>
        </form>

        <p className="mt-6 font-body text-center" style={{ fontSize: 11, color: "#8aadb3" }}>
          Po nastavení hesla tě přesměrujeme do aplikace.
        </p>
      </div>
    </div>
  );
};

export default SetPassword;
