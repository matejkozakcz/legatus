import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import { OnboardingModal } from "@/components/OnboardingModal";
import legatusLogo from "@/assets/legatus-logo-light.png";
import loginBg from "@/assets/login-bg.svg";

const Login = () => {
  const { session, loading, needsOnboarding, signIn } = useAuth();
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
        setError(error.message);
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

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-5">
          <div className="flex-1 h-px" style={{ background: "#e2eaec" }} />
          <span className="font-body text-xs" style={{ color: "#8aadb3" }}>
            nebo
          </span>
          <div className="flex-1 h-px" style={{ background: "#e2eaec" }} />
        </div>

        {/* OAuth buttons */}
        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={oauthLoading || submitting}
            className="w-full flex items-center justify-center gap-2.5 font-body font-semibold disabled:opacity-50 transition-colors"
            style={{
              background: "#ffffff",
              border: "1.5px solid #e2eaec",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 14,
              color: "#0c2226",
            }}
          >
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
            Pokračovat přes Google
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("apple")}
            disabled={oauthLoading || submitting}
            className="w-full flex items-center justify-center gap-2.5 font-body font-semibold disabled:opacity-50 transition-colors"
            style={{
              background: "#000000",
              border: "1.5px solid #000000",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 14,
              color: "#ffffff",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="white">
              <path d="M13.545 8.82c-.022-2.26 1.845-3.345 1.929-3.396-1.05-1.536-2.685-1.746-3.266-1.77-1.39-.141-2.714.819-3.42.819-.705 0-1.796-.798-2.951-.777-1.518.022-2.917.883-3.698 2.243-1.577 2.736-.404 6.79 1.133 9.012.751 1.087 1.648 2.307 2.826 2.264 1.133-.046 1.562-.733 2.932-.733 1.37 0 1.755.733 2.953.71 1.22-.022 1.996-1.108 2.742-2.197.864-1.26 1.22-2.48 1.242-2.544-.027-.012-2.383-.915-2.408-3.63h.006Zm-2.26-6.672c.624-.757 1.045-1.808.93-2.856-.9.037-1.99.6-2.636 1.356-.58.67-1.087 1.74-.951 2.767 1.004.078 2.028-.51 2.657-1.267Z" />
            </svg>
            Pokračovat přes Apple
          </button>
        </div>

        <p className="mt-8 font-body" style={{ fontSize: 11, color: "#8aadb3" }}>
          © 2026 Matěj Kozák
        </p>
      </div>
    </div>
  );
};

export default Login;
