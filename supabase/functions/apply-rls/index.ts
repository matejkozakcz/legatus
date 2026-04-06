import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Action → SQL command mapping ─────────────────────────────────────────────
const ACTION_TO_CMD: Record<string, string> = {
  vidí: "SELECT",
  edituje: "UPDATE",
  vytváří: "INSERT",
  maže: "DELETE",
};

// ─── Scope conditions per table × role × command ──────────────────────────────
// These define HOW the policy filters rows. The matrix controls WHETHER the policy exists.

type ScopeFn = (table: string, cmd: string) => { using?: string; check?: string } | null;

const ROLE_SCOPES: Record<string, ScopeFn> = {
  Admin: (_table, cmd) => {
    if (cmd === "SELECT" || cmd === "UPDATE")
      return { using: "public.is_admin()" };
    if (cmd === "INSERT")
      return { check: "public.is_admin()" };
    if (cmd === "DELETE")
      return { using: "public.is_admin()" };
    return null;
  },

  Vedoucí: (table, cmd) => {
    if (table === "profiles") {
      const expr = `(public.get_user_role(auth.uid()) = 'vedouci' AND public.is_in_vedouci_subtree(auth.uid(), id))`;
      if (cmd === "SELECT") return { using: expr };
      if (cmd === "UPDATE") return { using: expr, check: expr };
      return null;
    }
    // Tables with user_id column
    const subq = `(EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = ${table}.user_id AND profiles.vedouci_id = auth.uid() AND profiles.is_active = true))`;
    if (cmd === "SELECT") return { using: subq };
    if (cmd === "UPDATE") return { using: subq };
    return null;
  },

  "Bud. vedoucí": (table, cmd) => {
    // BV typically has limited access, similar structure to vedoucí but narrower
    if (table === "profiles" && cmd === "SELECT") {
      return { using: `(public.is_in_vedouci_subtree(auth.uid(), id))` };
    }
    return null;
  },

  Garant: (table, cmd) => {
    if (table === "profiles") {
      const expr = `(public.get_user_role(auth.uid()) = 'garant' AND garant_id = auth.uid())`;
      if (cmd === "SELECT") return { using: expr };
      if (cmd === "UPDATE") return { using: expr, check: expr };
      return null;
    }
    const subq = `(EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = ${table}.user_id AND profiles.garant_id = auth.uid() AND profiles.is_active = true))`;
    if (cmd === "SELECT") return { using: subq };
    return null;
  },

  Získatel: (_table, cmd) => {
    if (cmd === "SELECT" || cmd === "UPDATE" || cmd === "DELETE")
      return { using: "(auth.uid() = user_id)" };
    if (cmd === "INSERT")
      return { check: "(auth.uid() = user_id)" };
    return null;
  },

  Nováček: (_table, cmd) => {
    // Same as Získatel — own records only
    if (cmd === "SELECT" || cmd === "UPDATE" || cmd === "DELETE")
      return { using: "(auth.uid() = user_id)" };
    if (cmd === "INSERT")
      return { check: "(auth.uid() = user_id)" };
    return null;
  },
};

// profiles uses `id` not `user_id` for own-record checks
const OWN_RECORD_ROLES = ["Získatel", "Nováček"];
function adjustForProfiles(role: string, table: string, scope: { using?: string; check?: string } | null) {
  if (!scope || table !== "profiles" || !OWN_RECORD_ROLES.includes(role)) return scope;
  return {
    using: scope.using?.replace("user_id", "id"),
    check: scope.check?.replace("user_id", "id"),
  };
}

// Special tables where notifications have sender-based insert
const NOTIFICATION_INSERT_SCOPE = `((auth.uid() = sender_id) AND ((auth.uid() = recipient_id) OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = notifications.recipient_id AND (profiles.vedouci_id = auth.uid() OR profiles.garant_id = auth.uid() OR profiles.ziskatel_id = auth.uid()) AND profiles.is_active = true)))`;

// Tables managed by the system
const MANAGED_TABLES = ["profiles", "activity_records", "client_meetings", "cases", "notifications", "promotion_requests", "vedouci_goals", "app_config"];

interface PermRule {
  table: string;
  label: string;
  matrix: Record<string, string[]>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — must be admin
    const authHeader = req.headers.get("authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin using their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) throw new Error("Forbidden: admin only");

    const { matrix, dry_run = false } = await req.json() as { matrix: PermRule[]; dry_run?: boolean };
    if (!matrix || !Array.isArray(matrix)) throw new Error("Invalid matrix");

    const statements: string[] = [];
    const errors: string[] = [];

    for (const rule of matrix) {
      if (!MANAGED_TABLES.includes(rule.table)) {
        errors.push(`Skipping unmanaged table: ${rule.table}`);
        continue;
      }

      // Generate DROP statements
      statements.push(`-- === ${rule.table} (${rule.label}) ===`);
      statements.push(`DO $$ DECLARE pol record; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = '${rule.table}' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.${rule.table}', pol.policyname); END LOOP; END $$;`);

      // Always ensure RLS is enabled
      statements.push(`ALTER TABLE public.${rule.table} ENABLE ROW LEVEL SECURITY;`);

      // Generate CREATE POLICY statements
      const policyCounter: Record<string, number> = {};

      for (const [role, actions] of Object.entries(rule.matrix)) {
        if (!actions || actions.length === 0) continue;

        for (const action of actions) {
          const cmd = ACTION_TO_CMD[action];
          if (!cmd) continue;

          let scope = ROLE_SCOPES[role]?.(rule.table, cmd);
          scope = adjustForProfiles(role, rule.table, scope);

          // Special handling for notifications INSERT
          if (rule.table === "notifications" && cmd === "INSERT" && (role === "Vedoucí" || role === "Garant")) {
            scope = { check: NOTIFICATION_INSERT_SCOPE };
          }

          if (!scope) {
            errors.push(`No scope defined for ${role} ${cmd} on ${rule.table}, skipping`);
            continue;
          }

          const policyKey = `${role}_${cmd}`;
          if (!policyCounter[policyKey]) policyCounter[policyKey] = 0;
          policyCounter[policyKey]++;

          const policyName = `${role} can ${action} ${rule.table}`.replace(/[^a-zA-Z0-9_ ]/g, "").substring(0, 60);

          let sql = `CREATE POLICY "${policyName}" ON public.${rule.table} FOR ${cmd} TO authenticated`;

          const wrapParen = (expr: string) => expr.startsWith("(") ? expr : `(${expr})`;
          if (scope.using && scope.check) {
            sql += ` USING ${wrapParen(scope.using)} WITH CHECK ${wrapParen(scope.check)}`;
          } else if (scope.using) {
            sql += ` USING ${wrapParen(scope.using)}`;
          } else if (scope.check) {
            sql += ` WITH CHECK ${wrapParen(scope.check)}`;
          }

          sql += ";";
          statements.push(sql);
        }
      }
    }

    if (dry_run) {
      return new Response(JSON.stringify({ success: true, dry_run: true, statements, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute all statements
    const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
    const fullSql = statements.filter(s => !s.startsWith("--")).join("\n");

    // Use adminClient to execute via raw postgres
    // Actually use pg connection
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const sql = postgres(dbUrl);

    try {
      await sql.unsafe(fullSql);
      await sql.end();
    } catch (e) {
      await sql.end();
      throw new Error(`SQL execution failed: ${e.message}`);
    }

    return new Response(JSON.stringify({ success: true, applied: statements.length, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
