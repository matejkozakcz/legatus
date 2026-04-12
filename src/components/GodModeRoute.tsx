import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function GodModeRoute({ children }: { children: React.ReactNode }) {
  const { godMode } = useAuth();
  if (!godMode) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
