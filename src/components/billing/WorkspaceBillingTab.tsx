import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  PLAN_DEFAULTS,
  PLAN_LABELS,
  StatusBadge,
  PaymentsTable,
  calcPrice,
  type BillingRow,
  type PaymentRow,
} from "./BillingShared";

interface Props {
  orgUnitId: string;
  ownerId: string | null;
  memberCount: number;
}

type Plan = "pioneers" | "legacy" | "custom";

export function WorkspaceBillingTab({ orgUnitId, ownerId, memberCount }: Props) {
  const qc = useQueryClient();

  const { data: billingData } = useQuery({
    queryKey: ["workspace_billing", orgUnitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_billing")
        .select("*")
        .eq("org_unit_id", orgUnitId)
        .maybeSingle();
      return (data ?? null) as BillingRow | null;
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["workspace_payments", orgUnitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_payments")
        .select("*")
        .eq("org_unit_id", orgUnitId)
        .order("paid_at", { ascending: false });
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

  // Local edit state
  const [plan, setPlan] = useState<Plan>("pioneers");
  const [priceBase, setPriceBase] = useState(299);
  const [pricePerUser, setPricePerUser] = useState(99);
  const [usersIncluded, setUsersIncluded] = useState(1);
  const [billingStart, setBillingStart] = useState<string>("");
  const [grandfatheredUntil, setGrandfatheredUntil] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (billingData) {
      setPlan(billingData.plan);
      setPriceBase(billingData.price_base);
      setPricePerUser(billingData.price_per_user);
      setUsersIncluded(billingData.users_included);
      setBillingStart(billingData.billing_start ?? "");
      setGrandfatheredUntil(billingData.grandfathered_until ?? "");
      setNotes(billingData.notes ?? "");
    } else {
      setPlan("pioneers");
      setPriceBase(299);
      setPricePerUser(99);
      setUsersIncluded(1);
      setBillingStart("");
      setGrandfatheredUntil("");
      setNotes("");
    }
  }, [billingData, orgUnitId]);

  const handlePlanSelect = (p: Plan) => {
    setPlan(p);
    if (p !== "custom") {
      const d = PLAN_DEFAULTS[p];
      setPriceBase(d.price_base);
      setPricePerUser(d.price_per_user);
      setUsersIncluded(d.users_included);
    }
  };

  const livePrice = useMemo(
    () => calcPrice({ price_base: priceBase, price_per_user: pricePerUser, users_included: usersIncluded }, memberCount),
    [priceBase, pricePerUser, usersIncluded, memberCount]
  );

  const status: "active" | "trial" | "unpaid" = useMemo(() => {
    if (!billingStart) return "trial";
    const now = new Date();
    if (grandfatheredUntil && new Date(grandfatheredUntil) >= now) return "active";
    const lastPaid = payments.find((p) => p.status === "paid");
    if (!lastPaid) return "unpaid";
    const days = (now.getTime() - new Date(lastPaid.paid_at).getTime()) / 86400000;
    return days < 35 ? "active" : "unpaid";
  }, [billingStart, grandfatheredUntil, payments]);

  const saveBilling = useMutation({
    mutationFn: async () => {
      const payload = {
        org_unit_id: orgUnitId,
        plan,
        price_base: priceBase,
        price_per_user: pricePerUser,
        users_included: usersIncluded,
        billing_start: billingStart || null,
        grandfathered_until: grandfatheredUntil || null,
        notes: notes || null,
      };
      const { error } = await supabase
        .from("workspace_billing")
        .upsert(payload, { onConflict: "org_unit_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Předplatné uloženo");
      qc.invalidateQueries({ queryKey: ["workspace_billing", orgUnitId] });
      qc.invalidateQueries({ queryKey: ["workspace_billing_all"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  // Add payment form
  const [showAddForm, setShowAddForm] = useState(false);
  const [pDate, setPDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pDesc, setPDesc] = useState("");
  const [pAmount, setPAmount] = useState<string>("");
  const [pStatus, setPStatus] = useState<"paid" | "pending" | "info">("paid");

  const addPayment = useMutation({
    mutationFn: async () => {
      // Snapshot members
      const { data: members } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("org_unit_id", orgUnitId)
        .eq("is_active", true);
      const snapshot = (members ?? []).map((m: any) => ({
        id: m.id,
        full_name: m.full_name,
        role: m.role,
        amount_czk: m.id === ownerId ? priceBase : pricePerUser,
      }));
      const computedAmount =
        pStatus === "info"
          ? null
          : pAmount
            ? Number(pAmount)
            : snapshot.reduce((s, m) => s + m.amount_czk, 0);
      const { error } = await supabase.from("workspace_payments").insert({
        org_unit_id: orgUnitId,
        paid_at: pDate,
        description: pDesc,
        amount_czk: computedAmount,
        status: pStatus,
        members_snapshot: pStatus === "info" ? null : snapshot,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Platba přidána");
      qc.invalidateQueries({ queryKey: ["workspace_payments", orgUnitId] });
      setShowAddForm(false);
      setPDesc("");
      setPAmount("");
      setPStatus("paid");
    },
    onError: (e: any) => toast.error(e.message ?? "Chyba"),
  });

  return (
    <div className="space-y-6">
      {/* Plan cards */}
      <section className="space-y-3">
        <h3 className="font-heading font-semibold text-foreground">Plán</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(Object.keys(PLAN_LABELS) as Plan[]).map((p) => {
            const isActive = plan === p;
            const d = PLAN_DEFAULTS[p];
            return (
              <div key={p} className="relative">
                {isActive && (
                  <span
                    className="absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white z-10"
                    style={{ background: "#00555f" }}
                  >
                    Aktivní
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handlePlanSelect(p)}
                  className="w-full text-left rounded-xl p-4 transition-colors bg-card hover:bg-muted/50"
                  style={{
                    border: isActive ? "2px solid #00555f" : "0.5px solid hsl(var(--border))",
                  }}
                >
                  <div className="font-heading font-semibold text-foreground">{PLAN_LABELS[p]}</div>
                  {p !== "custom" ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      {d.price_base} Kč base · {d.price_per_user} Kč/user
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1">Vlastní ceny</div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {plan === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div>
              <Label className="text-xs">Cena workspace (Kč)</Label>
              <Input
                type="number"
                value={priceBase}
                onChange={(e) => setPriceBase(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Cena za dalšího uživatele (Kč)</Label>
              <Input
                type="number"
                value={pricePerUser}
                onChange={(e) => setPricePerUser(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Počet uživatelů v ceně</Label>
              <Input
                type="number"
                value={usersIncluded}
                onChange={(e) => setUsersIncluded(Number(e.target.value) || 0)}
              />
            </div>
          </div>
        )}
      </section>

      {/* Live price */}
      <div
        className="rounded-xl p-4 flex items-center justify-between"
        style={{ background: "hsl(var(--muted))" }}
      >
        <div>
          <div className="text-2xl font-heading font-bold text-foreground">
            {livePrice.toLocaleString("cs-CZ")} Kč/měsíc
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {memberCount} {memberCount === 1 ? "člen" : memberCount < 5 ? "členové" : "členů"} · {priceBase} +{" "}
            {Math.max(0, memberCount - usersIncluded)} × {pricePerUser}
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Metadata */}
      <section className="space-y-3">
        <h3 className="font-heading font-semibold text-foreground">Billing metadata</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Datum začátku billingu</Label>
            <Input
              type="date"
              value={billingStart}
              onChange={(e) => setBillingStart(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Grandfathered do</Label>
            <Input
              type="date"
              value={grandfatheredUntil}
              onChange={(e) => setGrandfatheredUntil(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Interní poznámka</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => saveBilling.mutate()}
            disabled={saveBilling.isPending}
            className="bg-[#fc7c71] hover:bg-[#fc7c71]/90 text-white"
          >
            {saveBilling.isPending ? "Ukládání…" : "Uložit změny"}
          </Button>
        </div>
      </section>

      {/* Payments */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-semibold text-foreground">Platby</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Přidat platbu
          </Button>
        </div>

        {showAddForm && (
          <div className="rounded-xl border border-border p-3 space-y-3 bg-card">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Datum</Label>
                <Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Popis</Label>
                <Input value={pDesc} onChange={(e) => setPDesc(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Částka (Kč)</Label>
                <Input
                  type="number"
                  value={pAmount}
                  onChange={(e) => setPAmount(e.target.value)}
                  placeholder="auto"
                />
              </div>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="w-40">
                <Label className="text-xs">Status</Label>
                <Select value={pStatus} onValueChange={(v: any) => setPStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Zaplaceno</SelectItem>
                    <SelectItem value="pending">Čeká</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => addPayment.mutate()}
                disabled={!pDesc || addPayment.isPending}
                className="bg-[#00abbd] hover:bg-[#00abbd]/90 text-white"
              >
                Uložit
              </Button>
            </div>
          </div>
        )}

        <PaymentsTable payments={payments} ownerId={ownerId} />
      </section>
    </div>
  );
}
