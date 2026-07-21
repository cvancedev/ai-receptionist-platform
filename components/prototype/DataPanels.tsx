import type { ConversationState } from "@/src/domain/conversation-state";

export function DataPanels({ state }: { state: ConversationState }) {
  const facts = Object.values(state.confirmedFacts);
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
      <Panel title="Confirmed facts" empty="No confirmed facts yet.">
        {facts.map((fact) => <li key={fact.field}><span className="font-medium">{fact.field}:</span> {fact.value}</li>)}
      </Panel>
      <Panel title="Missing required fields" empty="No required fields are missing.">
        {state.missingFields.map((field) => <li key={field}>{field}</li>)}
      </Panel>
      <Panel title="Corrections" empty="No corrections recorded.">
        {state.corrections.map((correction) => <li key={`${correction.field}-${correction.sequence}`}><span className="font-medium">{correction.field}:</span> {correction.previousValue} → {correction.correctedValue}</li>)}
      </Panel>
      <Panel title="Customer claims" empty="No customer claims recorded.">
        {state.customerClaims.map((claim) => <li key={`${claim.field}-${claim.sequence}`}><span className="font-medium">{claim.field}:</span> {claim.value}</li>)}
      </Panel>
    </div>
  );
}

function Panel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.some(Boolean);
  return (
    <section className="rounded-2xl border border-border bg-surface-primary p-5 shadow-[var(--shadow-subtle)]">
      <h2 className="font-semibold text-primary">{title}</h2>
      {hasItems ? <ul className="mt-3 space-y-2 text-xs leading-5 text-secondary">{children}</ul> : <p className="mt-3 text-xs text-muted">{empty}</p>}
    </section>
  );
}
