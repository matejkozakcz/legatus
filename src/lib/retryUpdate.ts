import { supabase } from "@/integrations/supabase/client";

/**
 * Aktualizuje řádek v client_meetings s automatickým retry pro krátkodobé
 * výpadky sítě (typicky iOS Safari "TypeError: Load failed", PWA na pozadí).
 */
export async function updateMeetingWithRetry(
  meetingId: string,
  data: Record<string, unknown>,
  attempts = 3,
): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const { error } = await supabase.from("client_meetings").update(data).eq("id", meetingId);
      if (!error) return;
      lastErr = error;
      // Pokud nejde o síťový/transient error, nezkoušej znova
      const msg = String(error.message || "").toLowerCase();
      const transient =
        msg.includes("load failed") ||
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("timeout") ||
        msg.includes("aborted");
      if (!transient) throw error;
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || "").toLowerCase();
      const transient =
        msg.includes("load failed") ||
        msg.includes("network") ||
        msg.includes("fetch") ||
        msg.includes("timeout") ||
        msg.includes("aborted");
      if (!transient && i === attempts - 1) throw e;
    }
    // exponenciální backoff: 400ms, 1s, 2s
    await new Promise((r) => setTimeout(r, 400 * Math.pow(2, i)));
  }
  throw lastErr ?? new Error("Uložení selhalo po opakování");
}

export function friendlyMutationError(err: any): string {
  const msg = String(err?.message || err || "");
  if (/load failed|network|fetch|aborted|timeout/i.test(msg)) {
    return "Síť selhala. Zkontroluj připojení a zkus to znovu.";
  }
  return msg || "Chyba při ukládání";
}
