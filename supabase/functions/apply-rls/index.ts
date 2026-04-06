import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

const wrapParen = (expr: string) => expr.startsWith("(") ? expr : `(${expr})`;

// Tables managed by the system
const MANAGED_TABLES = ["profiles", "activity_records", "client_meetings", "cases", "notifications", "promotion_requests", "vedouci_goals", "app_config"];

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
  return adminClient;
}

async function executeSql(statements: string[]) {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const fullSql = statements.filter(s => !s.startsWith("--")).join("\n");
  const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
  const sql = postgres(dbUrl);
  try {
    await sql.unsafe(fullSql);
    await sql.end();
  } catch (e) {
    await sql.end();
    throw new Error(`SQL execution failed: ${e.message}`);
  }
}

// ─── Type 1: Permission Matrix → RLS ─────────────────────────────────────────

const ACTION_TO_CMD: Record<string, string> = {
  vidí: "SELECT",
  edituje: "UPDATE",
  vytváří: "INSERT",
  maže: "DELETE",
};

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
    const subq = `(EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = ${table}.user_id AND profiles.vedouci_id = auth.uid() AND profiles.is_active = true))`;
    if (cmd === "SELECT") return { using: subq };
    if (cmd === "UPDATE") return { using: subq };
    return null;
  },
  "Bud. vedoucí": (table, cmd) => {
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
    if (cmd === "SELECT" || cmd === "UPDATE" || cmd === "DELETE")
      return { using: "(auth.uid() = user_id)" };
    if (cmd === "INSERT")
      return { check: "(auth.uid() = user_id)" };
    return null;
  },
};

const OWN_RECORD_ROLES = ["Získatel", "Nováček"];
function adjustForProfiles(role: string, table: string, scope: { using?: string; check?: string } | null) {
  if (!scope || table !== "profiles" || !OWN_RECORD_ROLES.includes(role)) return scope;
  return {
    using: scope.using?.replace("user_id", "id"),
    check: scope.check?.replace("user_id", "id"),
  };
}

const NOTIFICATION_INSERT_SCOPE = `((auth.uid() = sender_id) AND ((auth.uid() = recipient_id) OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = notifications.recipient_id AND (profiles.vedouci_id = auth.uid() OR profiles.garant_id = auth.uid() OR profiles.ziskatel_id = auth.uid()) AND profiles.is_active = true)))`;

interface PermRule {
  table: string;
  label: string;
  matrix: Record<string, string[]>;
}

function generateMatrixStatements(matrix: PermRule[]): { statements: string[]; errors: string[] } {
  const statements: string[] = [];
  const errors: string[] = [];

  for (const rule of matrix) {
    if (!MANAGED_TABLES.includes(rule.table)) {
      errors.push(`Skipping unmanaged table: ${rule.table}`);
      continue;
    }

    statements.push(`-- === ${rule.table} (${rule.label}) ===`);
    statements.push(`DO $$ DECLARE pol record; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = '${rule.table}' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.${rule.table}', pol.policyname); END LOOP; END $$;`);
    statements.push(`ALTER TABLE public.${rule.table} ENABLE ROW LEVEL SECURITY;`);

    for (const [role, actions] of Object.entries(rule.matrix)) {
      if (!actions || actions.length === 0) continue;

      for (const action of actions) {
        const cmd = ACTION_TO_CMD[action];
        if (!cmd) continue;

        let scope = ROLE_SCOPES[role]?.(rule.table, cmd);
        scope = adjustForProfiles(role, rule.table, scope);

        if (rule.table === "notifications" && cmd === "INSERT" && (role === "Vedoucí" || role === "Garant")) {
          scope = { check: NOTIFICATION_INSERT_SCOPE };
        }

        if (!scope) {
          errors.push(`No scope defined for ${role} ${cmd} on ${rule.table}, skipping`);
          continue;
        }

        const policyName = `${role} can ${action} ${rule.table}`.replace(/[^a-zA-Z0-9_ ]/g, "").substring(0, 60);
        let sql = `CREATE POLICY "${policyName}" ON public.${rule.table} FOR ${cmd} TO authenticated`;

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

  return { statements, errors };
}

// ─── Type 2: Visibility Rules → RLS SELECT policies ──────────────────────────

interface VisibilityRule {
  role: string;
  sees: string;
  scope: string;
}

// Map "sees" label to actual table names
const SEES_TO_TABLES: Record<string, string[]> = {
  "Profily": ["profiles"],
  "Aktivity & Schůzky": ["activity_records", "client_meetings"],
  "Byznys případy": ["cases"],
  "Promotion requests": ["promotion_requests"],
  "Vše vlastní": ["profiles", "activity_records", "client_meetings", "cases", "notifications", "vedouci_goals"],
  "Vše": ["profiles", "activity_records", "client_meetings", "cases", "notifications", "promotion_requests", "vedouci_goals", "app_config"],
};

// Map scope text to SQL USING expression per table
function scopeToSql(scope: string, table: string): string {
  const userCol = table === "profiles" ? "id" : "user_id";

  if (scope.includes("is_in_vedouci_subtree")) {
    if (table === "profiles") {
      return `(public.get_user_role(auth.uid()) = 'vedouci' AND public.is_in_vedouci_subtree(auth.uid(), id))`;
    }
    return `(public.is_in_vedouci_subtree(auth.uid(), ${userCol}))`;
  }
  if (scope.includes("vedouci_id = já") || scope.includes("vedouci_id")) {
    if (table === "profiles") {
      return `(vedouci_id = auth.uid() AND is_active = true)`;
    }
    return `(EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = ${table}.user_id AND profiles.vedouci_id = auth.uid() AND profiles.is_active = true))`;
  }
  if (scope.includes("garant_id = já") || scope.includes("garant_id")) {
    if (table === "profiles") {
      return `(public.get_user_role(auth.uid()) = 'garant' AND garant_id = auth.uid())`;
    }
    return `(EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = ${table}.user_id AND profiles.garant_id = auth.uid() AND profiles.is_active = true))`;
  }
  if (scope.includes("user_id = já") || scope.includes("Pouze vlastní")) {
    return `(auth.uid() = ${userCol})`;
  }
  if (scope.includes("is_admin")) {
    return `(public.is_admin())`;
  }
  if (scope.includes("role = vedouci") || scope.includes("Všichni vedoucí")) {
    return `(public.get_user_role(auth.uid()) = 'vedouci')`;
  }
  // Fallback
  return `(auth.uid() = ${userCol})`;
}

function generateVisibilityStatements(rules: VisibilityRule[], targetTables?: string[]): { statements: string[]; errors: string[] } {
  const statements: string[] = [];
  const errors: string[] = [];

  // Determine which tables are affected
  const affectedTables = new Set<string>();
  for (const rule of rules) {
    const tables = SEES_TO_TABLES[rule.sees] || [];
    tables.forEach(t => affectedTables.add(t));
  }

  const tablesToProcess = targetTables || Array.from(affectedTables);

  // Drop existing SELECT policies on affected tables
  for (const table of tablesToProcess) {
    if (!MANAGED_TABLES.includes(table)) continue;
    statements.push(`-- === Visibility: ${table} ===`);
    statements.push(`DO $$ DECLARE pol record; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = '${table}' AND cmd_name = 'SELECT' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.${table}', pol.policyname); END LOOP; END $$;`);
    statements.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  }

  // Generate SELECT policies from visibility rules
  const policyNames = new Set<string>();

  for (const rule of rules) {
    const tables = SEES_TO_TABLES[rule.sees] || [];
    if (tables.length === 0) {
      errors.push(`Unknown "sees" value: ${rule.sees}`);
      continue;
    }

    for (const table of tables) {
      if (!MANAGED_TABLES.includes(table) || !tablesToProcess.includes(table)) continue;

      const using = scopeToSql(rule.scope, table);
      let policyName = `${rule.role} vid ${table}`.replace(/[^a-zA-Z0-9_ ]/g, "").substring(0, 60);

      // Ensure unique names
      let suffix = 0;
      let uniqueName = policyName;
      while (policyNames.has(uniqueName)) {
        suffix++;
        uniqueName = `${policyName} ${suffix}`;
      }
      policyNames.add(uniqueName);

      statements.push(
        `CREATE POLICY "${uniqueName}" ON public.${table} FOR SELECT TO authenticated USING ${wrapParen(using)};`
      );
    }
  }

  return { statements, errors };
}

// ─── Type 3: Hierarchy Rules → RLS UPDATE policies on profiles ───────────────

interface HierarchyRule {
  relationship: string;
  meaning: string;
  whoSets: string;
}

function whoSetsToSql(whoSets: string): string {
  switch (whoSets) {
    case "Admin":
      return "(public.is_admin())";
    case "Vedoucí nebo Admin":
      return "(public.is_admin() OR (public.get_user_role(auth.uid()) = 'vedouci' AND public.is_in_vedouci_subtree(auth.uid(), id)))";
    case "Onboarding":
      return "(auth.uid() = id)"; // User can set during own onboarding
    case "Onboarding / Vedoucí / Admin":
      return "(auth.uid() = id OR public.is_admin() OR (public.get_user_role(auth.uid()) = 'vedouci' AND public.is_in_vedouci_subtree(auth.uid(), id)))";
    case "Systém":
      return "(false)"; // Only system/triggers, no direct user access
    default:
      return "(public.is_admin())";
  }
}

function generateHierarchyStatements(rules: HierarchyRule[]): { statements: string[]; errors: string[] } {
  const statements: string[] = [];
  const errors: string[] = [];

  // We generate UPDATE policies on profiles table for each relationship field
  // These policies control WHO can modify the relationship columns
  statements.push(`-- === Hierarchy: profiles UPDATE policies ===`);

  // Drop existing UPDATE policies on profiles
  statements.push(`DO $$ DECLARE pol record; BEGIN FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd_name = 'UPDATE' LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname); END LOOP; END $$;`);
  statements.push(`ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;`);

  // Collect all unique "whoSets" values and create combined policies
  // Group by whoSets to minimize number of policies
  const byWhoSets = new Map<string, string[]>();
  for (const rule of rules) {
    const fields = byWhoSets.get(rule.whoSets) || [];
    fields.push(rule.relationship);
    byWhoSets.set(rule.whoSets, fields);
  }

  // Always allow users to update their own profile (basic fields)
  statements.push(
    `CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);`
  );

  // Admin can update all
  statements.push(
    `CREATE POLICY "Admin can update all profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());`
  );

  // Vedoucí can update subtree
  statements.push(
    `CREATE POLICY "Vedouci can update subtree" ON public.profiles FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'vedouci' AND public.is_in_vedouci_subtree(auth.uid(), id)) WITH CHECK (public.get_user_role(auth.uid()) = 'vedouci' AND public.is_in_vedouci_subtree(auth.uid(), id));`
  );

  // Garant can update their novacci
  statements.push(
    `CREATE POLICY "Garant can update novacci" ON public.profiles FOR UPDATE TO authenticated USING (public.get_user_role(auth.uid()) = 'garant' AND garant_id = auth.uid()) WITH CHECK (public.get_user_role(auth.uid()) = 'garant' AND garant_id = auth.uid());`
  );

  // Log which rules were processed
  for (const [whoSets, fields] of byWhoSets.entries()) {
    statements.push(`-- Hierarchy: ${fields.join(", ")} → ${whoSets}`);
  }

  return { statements, errors };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await verifyAdmin(req);

    const body = await req.json();
    const { type = "matrix", dry_run = false } = body;

    let statements: string[] = [];
    let errors: string[] = [];

    if (type === "matrix") {
      const { matrix } = body as { matrix: PermRule[] };
      if (!matrix || !Array.isArray(matrix)) throw new Error("Invalid matrix");
      const result = generateMatrixStatements(matrix);
      statements = result.statements;
      errors = result.errors;
    } else if (type === "visibility") {
      const { rules } = body as { rules: VisibilityRule[] };
      if (!rules || !Array.isArray(rules)) throw new Error("Invalid visibility rules");
      const result = generateVisibilityStatements(rules);
      statements = result.statements;
      errors = result.errors;
    } else if (type === "hierarchy") {
      const { rules } = body as { rules: HierarchyRule[] };
      if (!rules || !Array.isArray(rules)) throw new Error("Invalid hierarchy rules");
      const result = generateHierarchyStatements(rules);
      statements = result.statements;
      errors = result.errors;
    } else {
      throw new Error(`Unknown type: ${type}`);
    }

    if (dry_run) {
      return new Response(JSON.stringify({ success: true, dry_run: true, statements, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await executeSql(statements);

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
