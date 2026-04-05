import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Clock, CalendarCheck, Share2, AlertTriangle, Check, TrendingUp, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { formatDistanceToNow } from "date-fns";
import { cs } from "date-fns/locale";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
  related_meeting_id: string | null;
  related_case_id: string | null;
}

interface NotificationBellProps {
  onMeetingClick?: (meetingId: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  meeting_reminder: <Clock className="h-4 w-4 text-secondary" />,
  post_meeting: <CalendarCheck className="h-4 w-4" style={{ color: "hsl(var(--teal))" }} />,
  deadline: <AlertTriangle className="h-4 w-4 text-destructive" />,
  garant_share: <Share2 className="h-4 w-4 text-muted-foreground" />,
  promotion_eligible: <TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--teal))" }} />,
  followup_needed: <AlertCircle className="h-4 w-4" style={{ color: "#fc7c71" }} />,
};

export function NotificationBell({ onMeetingClick }: NotificationBellProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, read, created_at, related_meeting_id, related_case_id")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setNotifications(data as unknown as Notification[]);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          fetchNotifications();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read: true }).eq("recipient_id", user.id).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markRead = async (notif: Notification) => {
    if (!notif.read) {
      await supabase.from("notifications").update({ read: true }).eq("id", notif.id);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)));
    }
    if (notif.related_meeting_id && onMeetingClick) {
      onMeetingClick(notif.related_meeting_id);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-xl hover:bg-muted transition-colors relative"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-destructive border-2 border-card" />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 min-w-80 max-h-96 overflow-y-auto rounded-2xl border shadow-xl z-50"
          style={{
            background: isDark ? "hsl(var(--card))" : "hsl(var(--card))",
            borderColor: isDark ? "rgba(255,255,255,0.1)" : "hsl(var(--border))",
            boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,85,95,0.15)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-heading font-semibold text-sm text-foreground">Oznámení</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-secondary hover:text-secondary/80 transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                Označit vše
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Žádné Oznámení</div>
          ) : (
            <div>
              {notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => markRead(notif)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-1 w-2">
                    {!notif.read && (
                      <span className="block w-2 h-2 rounded-full" style={{ background: "hsl(var(--secondary))" }} />
                    )}
                  </div>

                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {TYPE_ICONS[notif.type] || <Bell className="h-4 w-4 text-muted-foreground" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-tight ${notif.read ? "text-muted-foreground" : "text-foreground font-medium"}`}
                    >
                      {notif.title}
                    </p>
                    {notif.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: cs })}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
