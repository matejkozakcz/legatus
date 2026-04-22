import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export type RecipientRoleKey =
  | "self"
  | "ziskatel"
  | "garant"
  | "vedouci"
  | "all_vedouci"
  | "all_active";

export interface NotificationRule {
  id: string;
  name: string;
  trigger_event: string;
  is_active: boolean;
  title_template: string;
  body_template: string;
  icon: string | null;
  accent_color: string | null;
  link_url: string | null;
  recipient_roles: RecipientRoleKey[];
  recipient_filters: { only_active?: boolean; role_in?: string[] };
  conditions?: Record<string, unknown>;
}

export interface NotificationContext {
  /** The user the event is about (e.g. the promoted member, the new onboarded user). */
  subjectUserId: string;
  /** Sender — usually the current auth user; may equal subject. NULL for pure system events. */
  senderUserId?: string | null;
  /** Variables substituted into title_template / body_template. */
  variables?: Record<string, string | number | null | undefined>;
}

interface SubjectProfile {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean | null;
  vedouci_id: string | null;
  garant_id: string | null;
  ziskatel_id: string | null;
}

// ─── Template rendering ─────────────────────────────────────────────────────

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

// ─── Recipient resolution ───────────────────────────────────────────────────

async function resolveRecipientIds(
  rule: NotificationRule,
  subject: SubjectProfile,
): Promise<string[]> {
  const ids = new Set<string>();
  const roles = rule.recipient_roles ?? [];

  for (const r of roles) {
    switch (r) {
      case "self":
        ids.add(subject.id);
        break;
      case "ziskatel":
        if (subject.ziskatel_id) ids.add(subject.ziskatel_id);
        break;
      case "garant":
        if (subject.garant_id) ids.add(subject.garant_id);
        break;
      case "vedouci":
        if (subject.vedouci_id) ids.add(subject.vedouci_id);
        break;
      case "all_vedouci": {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("role", "vedouci")
          .eq("is_active", true);
        (data || []).forEach((p) => ids.add(p.id));
        break;
      }
      case "all_active": {
        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("is_active", true);
        (data || []).forEach((p) => ids.add(p.id));
        break;
      }
    }
  }

  if (ids.size === 0) return [];

  // Apply filters
  const filters = rule.recipient_filters ?? {};
  const onlyActive = filters.only_active !== false; // default true
  const roleIn = filters.role_in ?? [];

  if (onlyActive || roleIn.length > 0) {
    let query = supabase.from("profiles").select("id, role, is_active").in("id", Array.from(ids));
    if (onlyActive) query = query.eq("is_active", true);
    if (roleIn.length > 0) query = query.in("role", roleIn);
    const { data } = await query;
    return (data || []).map((p) => p.id);
  }

  return Array.from(ids);
}

// ─── Public helpers ─────────────────────────────────────────────────────────

/**
 * Triggers notifications for an event.
 * Looks up all active rules matching `trigger_event` and creates one notification per
 * resolved recipient per rule. Safe to call from anywhere on the client; failures are logged
 * but never thrown to the caller (notifications are best-effort).
 */
export async function sendNotification(
  triggerEvent: string,
  ctx: NotificationContext,
): Promise<void> {
  try {
    // Cast: notification_rules not yet in generated types
    const sb = supabase as unknown as {
      from: (tbl: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            eq: (col: string, val: unknown) => Promise<{ data: unknown; error: Error | null }>;
          };
        };
      };
    };

    const { data: rulesRaw, error: rulesErr } = await sb
      .from("notification_rules")
      .select("*")
      .eq("trigger_event", triggerEvent)
      .eq("is_active", true);

    if (rulesErr) {
      console.warn("[notifications] rule lookup failed:", rulesErr.message);
      return;
    }
    const rules = (rulesRaw as NotificationRule[] | null) ?? [];
    if (rules.length === 0) return;

    const { data: subject } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active, vedouci_id, garant_id, ziskatel_id")
      .eq("id", ctx.subjectUserId)
      .single();

    if (!subject) {
      console.warn("[notifications] subject profile not found:", ctx.subjectUserId);
      return;
    }

    const baseVars: Record<string, unknown> = {
      member_name: subject.full_name,
      member_role: subject.role,
      ...(ctx.variables ?? {}),
    };

    const rows: Array<Record<string, unknown>> = [];
    for (const rule of rules) {
      const recipients = await resolveRecipientIds(rule, subject as SubjectProfile);
      if (recipients.length === 0) continue;

      const title = renderTemplate(rule.title_template, baseVars);
      const body = renderTemplate(rule.body_template, baseVars);

      for (const recipientId of recipients) {
        rows.push({
          recipient_id: recipientId,
          sender_id: ctx.senderUserId ?? null,
          rule_id: rule.id,
          trigger_event: triggerEvent,
          title,
          body,
          icon: rule.icon,
          accent_color: rule.accent_color,
          link_url: rule.link_url,
          payload: { variables: baseVars, subject_id: subject.id },
        });
      }
    }

    if (rows.length === 0) return;

    const { error: insertErr } = await supabase.from("notifications").insert(rows as never);
    if (insertErr) console.warn("[notifications] insert failed:", insertErr.message);
  } catch (err) {
    console.warn("[notifications] unexpected error:", err);
  }
}
