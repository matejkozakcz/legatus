import { supabase } from "@/integrations/supabase/client";

interface LogErrorOptions {
  action: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}

export async function logError({ action, error, metadata }: LogErrorOptions): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const message = error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);

    await supabase.from("error_logs").insert({
      user_id: user?.id ?? undefined,
      action,
      error: message,
      metadata: (metadata ?? null) as never,
      url: window.location.pathname,
    });
  } catch {
    // logování nikdy nesmí crashnout appku
  }
}
