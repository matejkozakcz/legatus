import { supabase } from "@/integrations/supabase/client";

const PUSH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface NotificationRule {
  id: string;
  trigger_event: string;
  title_template: string;
  body_template: string;
  recipient_type: "self" | "hierarchy" | "by_role";
  recipient_roles: string[];
  is_active: boolean;
  send_push: boolean;
  send_in_app: boolean;
}

/**
 * Načte pravidlo notifikace z DB podle trigger_event.
 * Vrátí null pokud pravidlo neexistuje nebo není aktivní.
 */
export async function getNotificationRule(triggerEvent: string): Promise<NotificationRule | null> {
  const { data } = await supabase
    .from("notification_rules")
    .select("id, trigger_event, title_template, body_template, recipient_type, recipient_roles, is_active, send_push, send_in_app")
    .eq("trigger_event", triggerEvent)
    .eq("is_active", true)
    .limit(1)
    .single();

  return data as NotificationRule | null;
}

/**
 * Nahradí {{placeholder}} v šabloně hodnotami z vars mapy.
 */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

/**
 * Odešle push notifikaci přes edge funkci.
 */
async function sendPush(notificationId: string): Promise<void> {
  try {
    await fetch(PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ notification_id: notificationId }),
    });
  } catch {
    // best-effort
  }
}

/**
 * Vytvoří in-app notifikaci a volitelně odešle push.
 * senderId se použije jako sender_id (kvůli RLS).
 */
export async function sendRuleNotification(
  rule: NotificationRule,
  recipientId: string,
  senderId: string,
  vars: Record<string, string | number>
): Promise<void> {
  const title = renderTemplate(rule.title_template, vars);
  const body = renderTemplate(rule.body_template, vars);

  if (rule.send_in_app) {
    const { data: notifData } = await supabase
      .from("notifications")
      .insert({
        sender_id: senderId,
        recipient_id: recipientId,
        type: rule.trigger_event,
        title,
        body,
        deadline: new Date().toISOString().split("T")[0],
      })
      .select("id")
      .single();

    if (notifData?.id && rule.send_push) {
      await sendPush(notifData.id);
    }
  }
}
