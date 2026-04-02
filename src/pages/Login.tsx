import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff } from "lucide-react";
import legatusLogo from "@/assets/legatus-logo-light.png";

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
        <div className="animate-pulse text-white font-heading text-xl">Načítání...</div>
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
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center" style={{ backgroundColor: "#00555f" }}>
      {/* Diagonal parallelogram band */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "#dde8ea",
          clipPath: "polygon(0% 23%, 71% 0%, 100% 77%, 29% 100%)",
        }}
      />

      {/* Login card */}
      <div className="relative z-10 w-full max-w-[400px] mx-4 bg-card rounded-card shadow-card p-8 flex flex-col items-center">
        {/* Logo */}
        <img src={legatusLogo} alt="Legatus" className="h-16 mb-2" />
        <h1 className="font-heading text-lg font-bold tracking-[0.25em] text-foreground mb-8">
          LEGATUS
        </h1>

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <label className="block text-sm font-body font-medium text-muted-foreground mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-11 px-4 rounded-input border border-input bg-background text-foreground font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              placeholder="vas@email.cz"
            />
          </div>

          <div>
            <label className="block text-sm font-body font-medium text-muted-foreground mb-1.5">
              Heslo
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full h-11 px-4 pr-11 rounded-input border border-input bg-background text-foreground font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-destructive text-sm font-body text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-input bg-primary text-primary-foreground font-heading font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Přihlašování..." : "Přihlásit se"}
          </button>
        </form>

        <p className="mt-8 text-xs text-muted-foreground font-body">
          © 2026 Matěj Kozák
        </p>
      </div>
    </div>
  );
};

export default Login;
