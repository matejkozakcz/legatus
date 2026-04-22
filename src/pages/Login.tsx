import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { OnboardingModal } from "@/components/OnboardingModal";
import { InstallPwaPrompt } from "@/components/InstallPwaPrompt";
import legatusLogo from "@/assets/legatus-logo-light.png";
const loginBg = "/login-bg.svg";

const Login = () => {
  const { session, loading, needsOnboarding, needsReactivation, deactivatedProfile, reactivateProfile, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleOAuth = async (provider: "google" | "apple") => {
    setError("");
    setOauthLoading(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Přihlášení se nezdařilo. Zkuste to znovu.");
    }
    if (result.redirected) return;
    setOauthLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#e1e9eb" }}>
        <div className="font-heading text-xl" style={{ color: "#ffffff" }}>
          Načítání...
        </div>
      </div>
    );
  }

  // Show reactivation choice if deactivated user logs in
  if (session && needsReactivation && deactivatedProfile) {
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
          <h2 className="font-heading font-bold text-xl mb-2" style={{ color: "#00555f" }}>
            Vítej zpět, {deactivatedProfile.full_name}!
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: "#6b7280" }}>
            Tvůj účet byl dříve deaktivován. Chceš pokračovat s původními daty, nebo začít úplně od začátku?
          </p>

          <button
            onClick={() => reactivateProfile(true)}
            className="w-full py-3 rounded-xl font-semibold text-white mb-3 transition-all hover:opacity-90"
            style={{ background: "#00abbd" }}
          >
            Použít původní data
          </button>
          <button
            onClick={() => reactivateProfile(false)}
            className="w-full py-3 rounded-xl font-semibold transition-all hover:opacity-90"
            style={{ background: "#f3f4f6", color: "#374151" }}
          >
            Začít od začátku
          </button>
          <p className="text-xs text-center mt-4" style={{ color: "#9ca3af" }}>
            Při obou volbách projdeš nastavením profilu.
          </p>
        </div>
      </div>
    );
  }

  // Show onboarding overlay if logged in but not onboarded
  if (session && needsOnboarding) {
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
        <OnboardingModal open={true} />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError("Hesla se neshodují.");
        return;
      }
      if (password.length < 6) {
        setError("Heslo musí mít alespoň 6 znaků.");
        return;
      }
      setSubmitting(true);
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        if (error.message.includes("already registered") || error.message.includes("already_exists")) {
          setError("Tento e-mail je již zaregistrován. Zkus se přihlásit — pokud byl tvůj účet deaktivován, budeš moci pokračovat.");
          setIsSignUp(false);
        } else {
          setError(error.message);
        }
      }
      setSubmitting(false);
    } else {
      setSubmitting(true);
      const { error } = await signIn(email, password);
      if (error) {
        setError("Nesprávný e-mail nebo heslo.");
      }
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
        backgroundColor: "#00555F",
      }}
    >
      <div
        className="relative z-10 w-full max-w-[400px] mx-4 flex flex-col items-center"
        style={{
          background: "#ffffff",
          borderRadius: "28px",
          boxShadow: "0 8px 32px rgba(0,85,95,0.22)",
          padding: "32px",
        }}
      >
        <img src={legatusLogo} alt="Legatus" className="h-16 mb-2" />
        <h1 className="font-heading font-bold text-lg mb-8" style={{ letterSpacing: "0.15em", color: "#0c2226" }}>
          LEGATUS
        </h1>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="vas@email.cz"
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

          <div>
            <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}>
              Heslo
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
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
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <div>
              <label className="block font-body mb-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}>
                Potvrzení hesla
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
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
          )}

          {error && (
            <p className="font-body text-center" style={{ fontSize: 12, color: "#e05a50" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || oauthLoading}
            className="w-full btn btn-primary btn-lg disabled:opacity-50 font-heading font-semibold"
          >
            {submitting
              ? isSignUp
                ? "Registrace..."
                : "Přihlašování..."
              : isSignUp
                ? "Vytvořit účet"
                : "Přihlásit se"}
          </button>
        </form>

        {/* Toggle sign-in / sign-up */}
        <button
          type="button"
          onClick={() => {
            setIsSignUp(!isSignUp);
            setError("");
            setConfirmPassword("");
          }}
          className="mt-3 font-body text-sm transition-colors"
          style={{ color: "#00abbd" }}
        >
          {isSignUp ? "Už máte účet? Přihlásit se" : "Vytvořit účet"}
        </button>

        <p className="mt-8 font-body" style={{ fontSize: 11, color: "#8aadb3" }}>
          © 2026 Matěj Kozák
        </p>
      </div>
    </div>
  );
};

export default Login;
