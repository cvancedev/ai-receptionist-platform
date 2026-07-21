import { CONVERSATION_STAGES, type ConversationStage } from "@/src/shared/constants";

const stages: readonly { value: ConversationStage; label: string }[] = [
  { value: CONVERSATION_STAGES.INITIALIZED, label: "Initialization" },
  { value: CONVERSATION_STAGES.INTAKE, label: "Intake" },
  { value: CONVERSATION_STAGES.CLARIFICATION, label: "Clarification" },
  { value: CONVERSATION_STAGES.CONFIRMATION, label: "Confirmation" },
  { value: CONVERSATION_STAGES.ESCALATION, label: "Escalation" },
  { value: CONVERSATION_STAGES.HANDOFF, label: "Handoff" },
  { value: CONVERSATION_STAGES.COMPLETED, label: "Completed" },
  { value: CONVERSATION_STAGES.ABANDONED, label: "Abandoned" },
];

export function StageProgress({ activeStage }: { activeStage: ConversationStage }) {
  return (
    <section className="mt-6" aria-labelledby="progress-heading">
      <h2 id="progress-heading" className="sr-only">Conversation progress</h2>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {stages.map((stage) => {
          const active = stage.value === activeStage;
          return (
            <li key={stage.value} aria-current={active ? "step" : undefined} className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${active ? "border-brand bg-brand-surface text-brand" : "border-border bg-surface-primary text-muted"}`}>
              <span aria-hidden="true">{active ? "● " : "○ "}</span>{stage.label}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
