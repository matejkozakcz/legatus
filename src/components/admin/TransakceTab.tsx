import Transakce from "@/pages/Transakce";

// Wrapper that renders the Transakce page inside the Admin tab.
// Permission check is handled by Transakce itself (god mode + admin).
export function TransakceTab() {
  return (
    <div className="-m-4 md:-m-6">
      <Transakce />
    </div>
  );
}
