import type { PrototypeChatView } from "@/src/prototype-ui/prototype-chat-session";

export function ConversationStatus({ view }: { view: PrototypeChatView }) {
  const entries = [
    ["Stage", view.state.stage],
    ["Resolved service", view.resolvedService ?? "Unresolved"],
    ["Readiness", view.readiness],
    ["Escalation", view.state.escalation.status],
    ["Completion", view.state.completionState],
    ["Revision", String(view.state.revision)],
    ["Profile version", String(view.state.businessProfileVersion)],
    ["Handoff", view.handoff ? "Available" : "Unavailable"],
  ] as const;
  return (
    <section className="rounded-2xl border border-border bg-surface-primary p-5 shadow-[var(--shadow-subtle)]" aria-labelledby="status-heading">
      <h2 id="status-heading" className="font-semibold text-primary">Conversation status</h2>
      <dl className="mt-4 divide-y divide-border">
        {entries.map(([term, value]) => (
          <div key={term} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-xs font-medium text-muted">{term}</dt>
            <dd className="text-right text-xs font-semibold text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
