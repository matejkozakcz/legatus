import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { registerPushSubscription } from "@/lib/pushSubscription";

interface Profile {
  id: string;
  full_name: string;
  role: "vedouci" | "budouci_vedouci" | "garant" | "ziskatel" | "novacek";
  vedouci_id: string | null;
  garant_id: string | null;
  ziskatel_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  is_admin: boolean;
  monthly_bj_goal: number | null;
  onboarding_completed: boolean | null;
  ziskatel_name: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  needsOnboarding: boolean;
  isAdmin: boolean;
  godMode: boolean;
  toggleGodMode: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GOD_MODE_KEY = "legatus_godmode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [godMode, setGodMode] = useState<boolean>(() => {
    try { return localStorage.getItem(GOD_MODE_KEY) === "true"; } catch { return false; }
  });

  const isAdmin = profile?.is_admin === true;

  const toggleGodMode = useCallback(() => {
    if (!isAdmin) return;
    setGodMode((prev) => {
      const next = !prev;
      try { localStorage.setItem(GOD_MODE_KEY, String(next)); } catch {}
      return next;
    });
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && godMode) {
      setGodMode(false);
      try { localStorage.removeItem(GOD_MODE_KEY); } catch {}
    }
  }, [isAdmin, godMode]);

  const fetchProfile = useCallback(async (userId: string, retries = 2): Promise<void> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 500));
        return fetchProfile(userId, retries - 1);
      }
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    setProfile(data as unknown as Profile);
  }, []);

  const refetchProfile = useCallback(async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    let initialSessionHandled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Fetch profile first, then set loading to false
          fetchProfile(session.user.id).then(() => {
            if (!initialSessionHandled) {
              initialSessionHandled = true;
              setLoading(false);
            }
          });
          setTimeout(() => registerPushSubscription(session.user.id), 2000);
        } else {
          setProfile(null);
          if (!initialSessionHandled) {
            initialSessionHandled = true;
            setLoading(false);
          }
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(() => {
          if (!initialSessionHandled) {
            initialSessionHandled = true;
            setLoading(false);
          }
        });
      } else if (!initialSessionHandled) {
        initialSessionHandled = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setGodMode(false);
    try { localStorage.removeItem(GOD_MODE_KEY); } catch {}
  };

  const needsOnboarding = !!profile && profile.onboarding_completed === false;

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, needsOnboarding, isAdmin, godMode, toggleGodMode, signIn, signOut, refetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
