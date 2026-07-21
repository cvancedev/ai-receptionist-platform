import type { HandoffSummary } from "@/src/domain/handoff-summary";

export function HandoffPanel({ handoff }: { handoff: HandoffSummary | null }) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface-primary p-5 shadow-[var(--shadow-subtle)] sm:p-6" aria-labelledby="handoff-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="handoff-heading" className="text-lg font-semibold text-primary">Validated handoff summary</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${handoff ? "bg-brand-surface text-brand" : "bg-surface-secondary text-muted"}`}>{handoff ? "Available" : "Not available"}</span>
      </div>
      {!handoff ? (
        <p className="mt-3 text-sm text-muted">The panel remains empty until required facts are confirmed and the intake reaches handoff.</p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <SummaryList title="Traceability" items={[`Conversation: ${handoff.conversationId}`, `Business: ${handoff.businessProfileId}`, `Profile version: ${handoff.businessProfileVersion}`, `Revision: ${handoff.stateRevision}`]} />
          <SummaryList title="Outcome" items={[`Service: ${handoff.requestedService ?? "Unknown"}`, `Completion: ${handoff.completionStatus}`, `Escalation: ${handoff.escalationReason ?? "None"}`, `Missing: ${handoff.missingInformation.join(", ") || "None"}`]} />
          <SummaryList title="Corrections" items={handoff.corrections.length ? handoff.corrections : ["None"]} />
          <div className="lg:col-span-3">
            <SummaryList title="Confirmed facts" items={Object.entries(handoff.confirmedFacts).map(([field, value]) => `${field}: ${value}`)} />
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryList({ title, items }: { title: string; items: readonly string[] }) {
  return <div><h3 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{title}</h3><ul className="mt-2 space-y-1.5 text-sm text-secondary">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
}
