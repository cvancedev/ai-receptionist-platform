import type { PrototypeChatView } from "@/src/prototype-ui/prototype-chat-session";

export function ConversationStatus({ view }: { view: PrototypeChatView }) {
  if (view.integration.status === "projection-failure") {
    return (
      <section className="rounded-2xl border border-border bg-surface-primary p-5 shadow-[var(--shadow-subtle)]" aria-labelledby="status-heading">
        <h2 id="status-heading" className="font-semibold text-primary">Conversation status</h2>
        <p className="mt-3 text-xs leading-5 text-muted">
          Read-model projection failed closed. Raw conversation state is not displayed.
        </p>
      </section>
    );
  }

  const model = view.integration.readModel;
  const progress = model.completionProgress.status === "tracked"
    ? `${model.completionProgress.percentage}%`
    : "Not applicable";
  const entries = [
    ["Conversation", model.identity.conversationId],
    ["Stage", model.stage],
    ["Resolved service ID", model.resolvedServiceId ?? "Unresolved"],
    ["Readiness", view.readiness],
    ["Escalation", model.escalation.status],
    ["Completion", model.completionStatus],
    ["Progress", progress],
    ["Next action", model.recommendedNextAction],
    [
      "Customer release",
      model.status.canReleaseToCustomer ? "Authorized" : "Not authorized",
    ],
    ["Revision", String(model.revision)],
    ["Profile version", String(model.identity.businessProfileVersion)],
    ["AI decision", view.integration.decision?.decision ?? "Not attempted"],
    ["Execution", view.integration.execution?.reason ?? "Not attempted"],
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
