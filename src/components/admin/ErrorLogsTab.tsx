import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronRight, Check, RefreshCw, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ErrorLogRow {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  error: string;
  url: string | null;
  resolved: boolean;
  metadata: any;
  user_full_name?: string | null;
}

export function ErrorLogsTab() {
  const queryClient = useQueryClient();
  const [onlyUnresolved, setOnlyUnresolved] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-error-logs"],
    queryFn: async (): Promise<ErrorLogRow[]> => {
      const { data, error } = await supabase
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as ErrorLogRow[];

      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))
      );
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        const map = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
        return rows.map((r) => ({
          ...r,
          user_full_name: r.user_id ? (map.get(r.user_id) ?? null) : null,
        }));
      }
      return rows;
    },
  });

  const toggleResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase
        .from("error_logs")
        .update({ resolved })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-error-logs"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Nepodařilo se uložit"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (onlyUnresolved && l.resolved) return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        (l.error ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, onlyUnresolved, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat podle akce nebo chyby…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="only-unresolved"
            checked={onlyUnresolved}
            onCheckedChange={setOnlyUnresolved}
          />
          <Label htmlFor="only-unresolved" className="cursor-pointer">
            Pouze nevyřešené
          </Label>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Obnovit
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-[160px]">Čas</TableHead>
              <TableHead className="w-[160px]">Uživatel</TableHead>
              <TableHead className="w-[160px]">Akce</TableHead>
              <TableHead>Chyba</TableHead>
              <TableHead className="w-[180px]">URL</TableHead>
              <TableHead className="w-[110px] text-right">Stav</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Načítání…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Žádné záznamy
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log) => {
                const expanded = expandedId === log.id;
                const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;
                return (
                  <FragmentRow key={log.id}>
                    <TableRow
                      className={`cursor-pointer ${log.resolved ? "opacity-50" : ""}`}
                      onClick={() => setExpandedId(expanded ? null : log.id)}
                    >
                      <TableCell>
                        {hasMetadata ? (
                          expanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd.MM.yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.user_full_name ?? (
                          <span className="text-muted-foreground italic">
                            {log.user_id ? log.user_id.slice(0, 8) : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[400px] truncate" title={log.error}>
                        {log.error}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]" title={log.url ?? ""}>
                        {log.url ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.resolved ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <Check className="h-3 w-3 mr-1" />
                            Vyřešeno
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Otevřené</Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant={log.resolved ? "outline" : "default"}
                          onClick={() =>
                            toggleResolved.mutate({ id: log.id, resolved: !log.resolved })
                          }
                          disabled={toggleResolved.isPending}
                        >
                          {log.resolved ? "Otevřít" : "Vyřešit"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && hasMetadata && (
                      <TableRow key={`${log.id}-meta`} className="bg-muted/30">
                        <TableCell></TableCell>
                        <TableCell colSpan={7}>
                          <pre className="text-xs whitespace-pre-wrap break-all bg-background border rounded p-3 max-h-60 overflow-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </FragmentRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
