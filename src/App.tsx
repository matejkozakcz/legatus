import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import MojeAktivity from "./pages/MojeAktivity";
import SpravaTeam from "./pages/SpravaTeam";
import MemberActivity from "./pages/MemberActivity";
import Ukoly from "./pages/Ukoly";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner
        position="bottom-center"
        toastOptions={{
          className: "bg-legatus-deep-teal text-white font-body rounded-pill shadow-card",
        }}
      />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <AppLayout>
                  <Dashboard />
                </AppLayout>
              }
            />
            <Route
              path="/aktivity"
              element={
                <AppLayout>
                  <MojeAktivity />
                </AppLayout>
              }
            />
            <Route
              path="/tym"
              element={
                <AppLayout>
                  <SpravaTeam />
                </AppLayout>
              }
            />
            <Route
              path="/tym/:userId/aktivity"
              element={
                <AppLayout>
                  <MemberActivity />
                </AppLayout>
              }
            />
            <Route
              path="/ukoly"
              element={
                <AppLayout>
                  <Ukoly />
                </AppLayout>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
