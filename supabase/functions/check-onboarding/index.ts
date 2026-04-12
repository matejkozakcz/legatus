import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge function for onboarding notifications.
 * 
 * Event-driven (called from client):
 *   POST { type: "plan_assigned", novacek_id, sender_id }
 *   POST { type: "task_added", novacek_id, sender_id, task_title }
 * 
 * Scheduled (called by cron):
 *   POST { type: "check_deadlines" }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { type } = body;

    let sent = 0;

    if (type === "plan_assigned") {
      sent = await handlePlanAssigned(supabase, supabaseUrl, serviceRoleKey, body);
    } else if (type === "task_added") {
      sent = await handleTaskAdded(supabase, supabaseUrl, serviceRoleKey, body);
    } else if (type === "check_deadlines") {
      sent = await handleCheckDeadlines(supabase, supabaseUrl, serviceRoleKey);
    } else {
      return new Response(JSON.stringify({ error: "Unknown type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[check-onboarding] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function insertNotificationAndPush(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  senderId: string,
  recipientId: string,
  notifType: string,
  title: string,
  bodyText: string,
  redirectUrl?: string | null,
) {
  const { data: notif } = await supabase.from("notifications").insert({
    sender_id: senderId,
    recipient_id: recipientId,
    type: notifType,
    title,
    body: bodyText,
    deadline: new Date().toISOString().split("T")[0],
    redirect_url: redirectUrl || null,
  }).select("id").single();

  if (notif?.id) {
    await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ notification_id: notif.id }),
    }).catch(() => {});
  }
}

async function getNovacekWithHierarchy(supabase: any, novacekId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, vedouci_id, garant_id")
    .eq("id", novacekId)
    .single();
  return data;
}

// ─── Plan Assigned ────────────────────────────────────────────────────────────

async function handlePlanAssigned(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  body: any,
): Promise<number> {
  const { novacek_id, sender_id } = body;
  if (!novacek_id || !sender_id) return 0;

  const novacek = await getNovacekWithHierarchy(supabase, novacek_id);
  if (!novacek) return 0;

  let sent = 0;

  // 1. Notify the nováček
  await insertNotificationAndPush(
    supabase, supabaseUrl, serviceRoleKey,
    sender_id,
    novacek_id,
    "onboarding_plan_assigned",
    "Plán zapracování přidělen 🎯",
    `Tvůj vedoucí ti právě přidělil plán zapracování. Podívej se na úkoly a termíny v sekci Zapracování.`,
    "/zapracovani",
  );
  sent++;

  // 2. Notify garant if different from sender and vedoucí
  if (novacek.garant_id && novacek.garant_id !== sender_id && novacek.garant_id !== novacek.vedouci_id) {
    await insertNotificationAndPush(
      supabase, supabaseUrl, serviceRoleKey,
      sender_id,
      novacek.garant_id,
      "onboarding_plan_assigned",
      `Plán zapracování přidělen: ${novacek.full_name}`,
      `Nováčkovi ${novacek.full_name} byl přidělen plán zapracování. Můžeš sledovat jeho postup.`,
      "/zapracovani-management",
    );
    sent++;
  }

  console.log(`[check-onboarding] plan_assigned: ${novacek.full_name}, sent=${sent}`);
  return sent;
}

// ─── Task Added ───────────────────────────────────────────────────────────────

async function handleTaskAdded(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
  body: any,
): Promise<number> {
  const { novacek_id, sender_id, task_title } = body;
  if (!novacek_id || !sender_id) return 0;

  await insertNotificationAndPush(
    supabase, supabaseUrl, serviceRoleKey,
    sender_id,
    novacek_id,
    "onboarding_new_task",
    "Nový úkol v zapracování 📋",
    `Byl ti přidán nový úkol: ${task_title || "Nový úkol"}. Zkontroluj si termín v sekci Zapracování.`,
    "/zapracovani",
  );

  console.log(`[check-onboarding] task_added for ${novacek_id}: ${task_title}`);
  return 1;
}

// ─── Check Deadlines (Scheduled) ─────────────────────────────────────────────

async function handleCheckDeadlines(
  supabase: any,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<number> {
  const now = new Date();
  const pragueNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Prague" }));
  const today = formatDate(pragueNow);
  
  const twoDaysLater = new Date(pragueNow);
  twoDaysLater.setDate(twoDaysLater.getDate() + 2);
  const twoDaysLaterStr = formatDate(twoDaysLater);

  // Get all incomplete tasks
  const { data: tasks, error } = await supabase
    .from("onboarding_tasks")
    .select("id, title, deadline, novacek_id, completed")
    .eq("completed", false)
    .not("deadline", "is", null);

  if (error) {
    console.error("[check-onboarding] fetch tasks error:", error.message);
    return 0;
  }
  if (!tasks || tasks.length === 0) return 0;

  let sent = 0;

  // Group by novacek for efficiency
  const byNovacek = new Map<string, typeof tasks>();
  for (const task of tasks) {
    if (!byNovacek.has(task.novacek_id)) byNovacek.set(task.novacek_id, []);
    byNovacek.get(task.novacek_id)!.push(task);
  }

  for (const [novacekId, novacekTasks] of byNovacek) {
    const overdueTasks = novacekTasks.filter((t: any) => t.deadline < today);
    const approachingTasks = novacekTasks.filter((t: any) => t.deadline >= today && t.deadline <= twoDaysLaterStr);

    // Check if we already sent a notification today (dedup using existing notifications)
    const { data: todayNotifs } = await supabase
      .from("notifications")
      .select("id, type")
      .eq("recipient_id", novacekId)
      .gte("created_at", `${today}T00:00:00`)
      .in("type", ["onboarding_overdue", "onboarding_deadline_soon"]);

    const alreadySentOverdue = todayNotifs?.some((n: any) => n.type === "onboarding_overdue");
    const alreadySentApproaching = todayNotifs?.some((n: any) => n.type === "onboarding_deadline_soon");

    // Overdue notification
    if (overdueTasks.length > 0 && !alreadySentOverdue) {
      const taskNames = overdueTasks.map((t: any) => t.title).slice(0, 3).join(", ");
      const extra = overdueTasks.length > 3 ? ` a ${overdueTasks.length - 3} dalších` : "";
      await insertNotificationAndPush(
        supabase, supabaseUrl, serviceRoleKey,
        novacekId,
        novacekId,
        "onboarding_overdue",
        `⚠️ Zpoždění v zapracování`,
        `Máš ${overdueTasks.length} úkol${overdueTasks.length > 1 ? "y" : ""} po termínu: ${taskNames}${extra}. Splň je co nejdříve!`,
        "/zapracovani",
      );
      sent++;
    }

    // Approaching deadline notification
    if (approachingTasks.length > 0 && !alreadySentApproaching) {
      const taskNames = approachingTasks.map((t: any) => t.title).slice(0, 3).join(", ");
      await insertNotificationAndPush(
        supabase, supabaseUrl, serviceRoleKey,
        novacekId,
        novacekId,
        "onboarding_deadline_soon",
        `⏰ Blíží se termín zapracování`,
        `Blíží se deadline: ${taskNames}. Nezapomeň splnit úkoly včas!`,
        "/zapracovani",
      );
      sent++;
    }
  }

  console.log(`[check-onboarding] check_deadlines done, sent=${sent}`);
  return sent;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
