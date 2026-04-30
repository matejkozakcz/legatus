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
  /** The logged-in user's real profile. */
  profile: Profile | null;
  /** Same as `profile`, except when an admin is in "view as workspace" mode —
   *  then this returns the workspace owner's profile so pages render that
   *  workspace's data tree. Use this for read-mostly pages (Dashboard, Tým,
   *  Obchodní případy). Use `profile` for anything tied to the actual user
   *  (settings, identity, write paths). */
  effectiveProfile: Profile | null;
  /** True when `effectiveProfile` differs from `profile`. */
  isViewingAsWorkspace: boolean;
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
  const [viewAsProfile, setViewAsProfile] = useState<Profile | null>(null);
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

  // ── "View as workspace" support ────────────────────────────────
  // When an admin enters a workspace from /admin, we transparently swap
  // the active `profile` with the workspace owner's profile. All pages
  // that read off `profile` (Dashboard, Tým, Obchodní případy) then
  // render that workspace's data automatically. The real `user` and
  // `isAdmin` flag remain untouched.
  const loadViewAsProfile = useCallback(async () => {
    if (!isAdmin) {
      setViewAsProfile(null);
      return;
    }
    let wsId: string | null = null;
    try { wsId = localStorage.getItem("legatus_active_workspace"); } catch {}
    if (!wsId) {
      setViewAsProfile(null);
      return;
    }
    const { data: ws } = await supabase
      .from("org_units")
      .select("owner_id")
      .eq("id", wsId)
      .maybeSingle();
    if (!ws?.owner_id) {
      setViewAsProfile(null);
      return;
    }
    const { data: op } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", ws.owner_id)
      .eq("is_active", true)
      .maybeSingle();
    setViewAsProfile((op as unknown as Profile) ?? null);
  }, [isAdmin]);

  useEffect(() => {
    loadViewAsProfile();
    // Re-load when localStorage changes from another tab
    const onStorage = (e: StorageEvent) => {
      if (e.key === "legatus_active_workspace") loadViewAsProfile();
    };
    // Custom event we dispatch ourselves on enter/exit (same tab)
    const onCustom = () => loadViewAsProfile();
    window.addEventListener("storage", onStorage);
    window.addEventListener("legatus:workspace-view-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("legatus:workspace-view-changed", onCustom);
    };
  }, [loadViewAsProfile]);

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
    try {
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
        }
      }
    } catch (e) {
      console.warn("push cleanup on signOut failed:", e);
    }

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
          role: "ziskatel",
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

  // Effective profile: workspace owner when admin is "viewing as", else real.
  const effectiveProfile: Profile | null = viewAsProfile ?? profile;
  const isViewingAsWorkspace = !!viewAsProfile;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        realProfile: profile,
        profile: effectiveProfile,
        isViewingAsWorkspace,
        loading,
        needsOnboarding,
        needsReactivation,
        deactivatedProfile,
        isAdmin,
        godMode,
        toggleGodMode,
        signIn,
        signOut,
        refetchProfile,
        reactivateProfile,
      }}
    >
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
