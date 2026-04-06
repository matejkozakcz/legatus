import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, needsOnboarding, needsReactivation } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-foreground font-heading text-xl">Načítání...</div>
      </div>
    );
  }

  if (!session || needsOnboarding || needsReactivation) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
