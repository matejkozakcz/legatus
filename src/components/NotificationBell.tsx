import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  BellRing,
  Trophy,
  Star,
  Award,
  TrendingUp,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Zap,
  Check,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  accent_color: string | null;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}

const ICON_MAP: Record<string, typeof Bell> = {
  Bell, BellRing, Trophy, Star, Award, TrendingUp,
  Calendar, CheckCircle2, AlertCircle, Info, Sparkles, Zap,
};

const ACCENT_COLOR_MAP: Record<string, string> = {
  primary: "hsl(var(--primary))",
  accent: "hsl(var(--accent))",
  success: "hsl(142 76% 36%)",
  warning: "hsl(38 92% 50%)",
  destructive: "hsl(var(--destructive))",
};

function resolveAccent(color: string | null): string {
  if (!color) return "hsl(var(--muted-foreground))";
  if (ACCENT_COLOR_MAP[color]) return ACCENT_COLOR_MAP[color];
  return color; // assume raw HSL/hex token
}

interface Props {
  compact?: boolean;
}

export function NotificationBell({ compact = false }: Props) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications = [], refetch } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, icon, accent_color, link_url, read_at, created_at")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as NotificationRow[];
    },
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          refetch();
          // Subtle bell tick animation handled via key on icon
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetch]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const deleteNotif = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const handleClick = async (n: NotificationRow) => {
    if (!n.read_at) await markAsRead(n.id);
    if (n.link_url) {
      setOpen(false);
      navigate(n.link_url);
    }
  };

  const buttonSize = compact ? 38 : 40;
  const buttonStyle: React.CSSProperties = {
    position: "relative",
    width: buttonSize,
    height: buttonSize,
    borderRadius: "50%",
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,85,95,0.15)",
    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.65)",
    backdropFilter: "blur(16px) saturate(1.8)",
    WebkitBackdropFilter: "blur(16px) saturate(1.8)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: isDark ? "0 2px 12px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,85,95,0.15)",
    transition: "all 0.25s ease",
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label="Notifikace" style={buttonStyle}>
          {unreadCount > 0 ? (
            <BellRing size={17} color={isDark ? "#4dd8e8" : "#00555f"} className="animate-pulse" />
          ) : (
            <Bell size={17} color={isDark ? "#4dd8e8" : "#00555f"} />
          )}
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: isDark ? "1.5px solid hsl(188,35%,7%)" : "1.5px solid #dde8ea",
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" sideOffset={10}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-heading font-semibold text-sm text-foreground">Notifikace</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={markAllRead}
            >
              <Check className="h-3 w-3" /> Označit vše jako přečtené
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[420px]">
          {notifications.length === 0 ? (
            <div className="py-12 px-4 flex flex-col items-center text-center gap-2">
              <Bell className="h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-xs text-muted-foreground">Zatím žádné notifikace</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = ICON_MAP[n.icon ?? "Bell"] ?? Bell;
                const accent = resolveAccent(n.accent_color);
                const isUnread = !n.read_at;
                return (
                  <li
                    key={n.id}
                    className={`group relative px-4 py-3 transition-colors cursor-pointer ${
                      isUnread ? "bg-accent/5" : "hover:bg-muted/30"
                    }`}
                    onClick={() => handleClick(n)}
                  >
                    <div className="flex gap-3">
                      <div
                        className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center"
                        style={{ background: `${accent}20`, color: accent }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-foreground line-clamp-1">
                            {n.title}
                          </p>
                          {isUnread && (
                            <span
                              className="flex-shrink-0 mt-1.5 h-2 w-2 rounded-full"
                              style={{ background: "hsl(var(--primary))" }}
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), {
                            addSuffix: true,
                            locale: cs,
                          })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotif(n.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-start"
                        title="Smazat"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
