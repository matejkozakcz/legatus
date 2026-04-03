// Stránka Obchodní případy — per-klient záznamy FSA/SER
// UI bude implementováno v dalším kroku po aplikaci DB migrace.

export default function ObchodniPripady() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <h1
        className="font-heading font-semibold"
        style={{ fontSize: 26, color: "#0c2226" }}
      >
        Obchodní případy
      </h1>
      <p className="text-muted-foreground font-body text-sm">
        Připravujeme&hellip; Nejprve prosím spusť databázovou migraci v Supabase.
      </p>
    </div>
  );
}
