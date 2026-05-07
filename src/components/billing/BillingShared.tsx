import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cs } from "date-fns/locale";

export const ROLE_LABELS: Record<string, string> = {
  vedouci: "Vedoucí",
  budouci_vedouci: "Budoucí vedoucí",
  garant: "Garant",
  ziskatel: "Získatel",
  novacek: "Nováček",
};

export const ROLE_COLORS: Record<string, string> = {
  vedouci: "#00555f",
  budouci_vedouci: "#22c55e",
  garant: "#7c5cff",
  ziskatel: "#00abbd",
  novacek: "#94a3b8",
};

export const PLAN_LABELS: Record<string, string> = {
  pioneers: "Pioneers",
  legacy: "Legacy",
  custom: "Custom",
};

export const PLAN_DEFAULTS: Record<string, { price_base: number; price_per_user: number; users_included: number }> = {
  pioneers: { price_base: 299, price_per_user: 99, users_included: 1 },
  legacy: { price_base: 599, price_per_user: 159, users_included: 1 },
  custom: { price_base: 0, price_per_user: 0, users_included: 1 },
};

export interface BillingRow {
  id?: string;
  org_unit_id: string;
  plan: "pioneers" | "legacy" | "custom";
  price_base: number;
  price_per_user: number;
  users_included: number;
  billing_start: string | null;
  grandfathered_until: string | null;
  notes: string | null;
}

export interface PaymentRow {
  id: string;
  paid_at: string;
  description: string;
  amount_czk: number | null;
  status: "paid" | "pending" | "info";
  members_snapshot: Array<{ id: string; full_name: string; role: string; amount_czk: number }> | null;
}

export function calcPrice(billing: { price_base: number; price_per_user: number; users_included: number } | null, memberCount: number) {
  if (!billing) return 0;
  return billing.price_base + Math.max(0, memberCount - billing.users_included) * billing.price_per_user;
}

export function StatusBadge({ status }: { status: "active" | "trial" | "unpaid" | "paid" | "pending" | "info" }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    active: { bg: "rgba(34,197,94,0.15)", fg: "#16a34a", label: "Aktivní" },
    trial: { bg: "rgba(245,158,11,0.15)", fg: "#d97706", label: "Trial" },
    unpaid: { bg: "rgba(239,68,68,0.15)", fg: "#dc2626", label: "Neplaceno" },
    paid: { bg: "rgba(34,197,94,0.15)", fg: "#16a34a", label: "Zaplaceno" },
    pending: { bg: "rgba(245,158,11,0.15)", fg: "#d97706", label: "Čeká" },
    info: { bg: "hsl(var(--muted))", fg: "hsl(var(--muted-foreground))", label: "Info" },
  };
  const m = map[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

export function PaymentTableRow({
  payment,
  ownerId,
}: {
  payment: PaymentRow;
  ownerId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const expandable = payment.status !== "info" && (payment.members_snapshot?.length ?? 0) > 0;
  const total =
    payment.amount_czk ??
    (payment.members_snapshot?.reduce((s, m) => s + (m.amount_czk ?? 0), 0) ?? 0);

  return (
    <>
      <tr
        className={`border-t border-border ${expandable ? "cursor-pointer hover:bg-muted/40" : ""}`}
        onClick={() => expandable && setOpen((o) => !o)}
      >
        <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {expandable ? (
              <ChevronRight
                className="h-3.5 w-3.5 text-muted-foreground transition-transform"
                style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
              />
            ) : (
              <span className="w-3.5" />
            )}
            {format(new Date(payment.paid_at), "d. M. yyyy", { locale: cs })}
          </div>
        </td>
        <td className="px-3 py-2 text-sm text-foreground">{payment.description}</td>
        <td className="px-3 py-2 text-sm text-right text-foreground whitespace-nowrap">
          {payment.amount_czk != null ? `${payment.amount_czk.toLocaleString("cs-CZ")} Kč` : "—"}
        </td>
        <td className="px-3 py-2 text-right">
          <StatusBadge status={payment.status} />
        </td>
      </tr>
      {open && expandable && (
        <tr className="bg-muted/30">
          <td colSpan={4} className="px-3 py-3">
            <div className="space-y-1.5">
              {(payment.members_snapshot ?? []).map((m) => {
                const isOwner = ownerId && m.id === ownerId;
                const color = ROLE_COLORS[m.role] ?? "#94a3b8";
                const initial = (m.full_name ?? "?").charAt(0).toUpperCase();
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                        style={{ background: color }}
                      >
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <div className="text-foreground truncate">{m.full_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {ROLE_LABELS[m.role] ?? m.role}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`text-sm whitespace-nowrap ${
                        isOwner ? "text-muted-foreground italic" : "text-foreground font-medium"
                      }`}
                    >
                      {isOwner
                        ? `${(m.amount_czk ?? 0).toLocaleString("cs-CZ")} Kč · v ceně workspace`
                        : `${(m.amount_czk ?? 0).toLocaleString("cs-CZ")} Kč`}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-2 border-t border-border text-sm font-semibold text-foreground">
                Celkem: {total.toLocaleString("cs-CZ")} Kč
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function PaymentsTable({
  payments,
  ownerId,
}: {
  payments: PaymentRow[];
  ownerId?: string | null;
}) {
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + (p.amount_czk ?? 0), 0);

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground italic">Žádné platby</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Datum</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Popis</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Částka</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <PaymentTableRow key={p.id} payment={p} ownerId={ownerId} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/30">
            <td colSpan={2} className="px-3 py-2 text-xs font-medium text-muted-foreground">
              Celkem zaplaceno
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold text-foreground">
              {totalPaid.toLocaleString("cs-CZ")} Kč
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
