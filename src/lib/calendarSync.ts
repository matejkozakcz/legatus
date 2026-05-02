import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget sync schůzky do propojeného Google Calendar.
 * Selže tiše — sync nesmí blokovat hlavní akci.
 */
export async function syncMeetingToCalendar(
  meetingId: string,
  op: "INSERT" | "UPDATE" | "DELETE",
  externalEventId?: string | null,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Quick check: skip if user has no calendar connection
    const { data: conn } = await supabase
      .from("user_calendar_connections" as any)
      .select("id")
      .eq("user_id", session.user.id)
      .eq("provider", "google")
      .maybeSingle();

    if (!conn) return;

    await supabase.functions.invoke("sync-meeting-to-calendar", {
      body: {
        meeting_id: meetingId,
        op,
        external_event_id: externalEventId,
      },
    });
  } catch (e) {
    console.warn("[calendar-sync] failed:", e);
  }
}
