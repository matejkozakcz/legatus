import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  needsReactivation: boolean;
  deactivatedProfile: Profile | null;
  isAdmin: boolean;
  godMode: boolean;
  toggleGodMode: () => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refetchProfile: () => Promise<void>;
  reactivateProfile: (keepData: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const GOD_MODE_KEY = "legatus_godmode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deactivatedProfile, setDeactivatedProfile] = useState<Profile | null>(null);
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
    // Only clear godMode after profile has loaded and user is confirmed non-admin
    if (profile && !isAdmin && godMode) {
      setGodMode(false);
      try { localStorage.removeItem(GOD_MODE_KEY); } catch {}
    }
  }, [profile, isAdmin, godMode]);

  const fetchProfile = useCallback(async (userId: string, retries = 2): Promise<void> => {
    // First try active profile
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .eq("is_active", true)
      .single();

    if (data && !error) {
      setProfile(data as unknown as Profile);
      setDeactivatedProfile(null);
      return;
    }

    // Check for deactivated profile
    const { data: inactiveData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .eq("is_active", false)
      .single();

    if (inactiveData) {
      // User has a deactivated profile — show reactivation flow
      setDeactivatedProfile(inactiveData as unknown as Profile);
      setProfile(null);
      return;
    }

    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return fetchProfile(userId, retries - 1);
    }

    await supabase.auth.signOut({ scope: 'local' });
    setProfile(null);
    setDeactivatedProfile(null);
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
    await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setUser(null);
    setProfile(null);
    setDeactivatedProfile(null);
    setGodMode(false);
    try { localStorage.removeItem(GOD_MODE_KEY); } catch {}
  };

  const reactivateProfile = useCallback(async (keepData: boolean) => {
    if (!user || !deactivatedProfile) return;
    
    if (keepData) {
      // Reactivate with existing data, go through onboarding to update info
      await supabase
        .from("profiles")
        .update({ is_active: true, onboarding_completed: false })
        .eq("id", user.id);
    } else {
      // Clear all data and start fresh
      // Delete activity records and meetings
      await Promise.all([
        supabase.from("activity_records").delete().eq("user_id", user.id),
        supabase.from("client_meetings").delete().eq("user_id", user.id),
        supabase.from("cases").delete().eq("user_id", user.id),
      ]);
      // Reset profile
      await supabase
        .from("profiles")
        .update({
          is_active: true,
          onboarding_completed: false,
          role: "novacek",
          vedouci_id: null,
          garant_id: null,
          ziskatel_id: null,
          ziskatel_name: null,
          avatar_url: null,
          monthly_bj_goal: 0,
          personal_bj_goal: 0,
          osobni_id: null,
        })
        .eq("id", user.id);
    }

    setDeactivatedProfile(null);
    await fetchProfile(user.id);
  }, [user, deactivatedProfile, fetchProfile]);

  const needsOnboarding = !!profile && profile.onboarding_completed === false;
  const needsReactivation = !!session && !profile && !!deactivatedProfile;

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, needsOnboarding, needsReactivation, deactivatedProfile, isAdmin, godMode, toggleGodMode, signIn, signOut, refetchProfile, reactivateProfile }}>
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
