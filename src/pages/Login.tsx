import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import legatusLogo from "@/assets/legatus-logo-light.png";
import loginBg from "@/assets/login-bg.svg";

const Login = () => {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#00555f" }}>
        <div className="font-heading text-xl" style={{ color: "#ffffff" }}>Načítání...</div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      setError("Nesprávný e-mail nebo heslo.");
    }
    setSubmitting(false);
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center"
      style={{
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >

      {/* Login card */}
      <div
        className="relative z-10 w-full max-w-[400px] mx-4 flex flex-col items-center"
        style={{
          background: "#ffffff",
          borderRadius: "28px",
          boxShadow: "0 8px 32px rgba(0,85,95,0.22)",
          padding: "32px",
        }}
      >
        {/* Logo */}
        <img src={legatusLogo} alt="Legatus" className="h-16 mb-2" />
        <h1
          className="font-heading font-bold text-lg mb-8"
          style={{ letterSpacing: "0.15em", color: "#0c2226" }}
        >
          LEGATUS
        </h1>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label
              className="block font-body mb-1.5"
              style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}
            >
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
            <label
              className="block font-body mb-1.5"
              style={{ fontSize: 13, fontWeight: 600, color: "#0c2226" }}
            >
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
            {submitting ? "Přihlašování..." : "Přihlásit se"}
          </button>
        </form>

        <p className="mt-8 font-body" style={{ fontSize: 11, color: "#8aadb3" }}>
          © 2026 Matěj Kozák
        </p>
      </div>
    </div>
  );
};

export default Login;
