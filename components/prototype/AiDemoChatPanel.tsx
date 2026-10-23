"use client";

import { useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { ConversationStatus } from "./ConversationStatus";
import { DataPanels } from "./DataPanels";
import { HandoffPanel } from "./HandoffPanel";
import { StageProgress } from "./StageProgress";
import {
  createAiDemoChatSession,
  type AiDemoChatView,
} from "@/src/prototype-ui/ai-demo-chat-session";

export function AiDemoChatPanel() {
  const [session] = useState(createAiDemoChatSession);
  const [view, setView] = useState<AiDemoChatView>(() => session.view());
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(() => session.auditLog());

  async function submit(message: string) {
    if (busy) return;
    setBusy(true);
    try {
      const next = await session.submit(message);
      setView(next);
      setAudit(session.auditLog());
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setView(session.reset());
    setAudit(session.auditLog());
  }

  const projectionFailed = view.integration.status === "projection-failure";

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {busy
          ? "A simulated AI turn is in progress."
          : `Simulated AI demonstration. Decision ${view.decision.decision}.`}
      </p>

      <section aria-labelledby="ai-demo-heading" className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="ai-demo-heading" className="text-lg font-semibold text-primary">
              Simulated AI demonstration
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">
              A deterministic simulated language layer proposes interpretations and
              extracted facts. The certified conversation engine alone changes state,
              asks questions, confirms intake, and builds the handoff. No provider,
              network request, credential, telephony, messaging, customer release, or
              external action is used.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="min-h-11 rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset AI demonstration
          </button>
        </div>
      </section>

      <section aria-labelledby="ai-decision-heading" className="mt-6 rounded-2xl border border-border bg-surface-primary p-5 shadow-[var(--shadow-subtle)] sm:p-6">
        <h2 id="ai-decision-heading" className="text-lg font-semibold text-primary">
          Simulated decision and audit trail
        </h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <Fact term="Approved task" value={view.decision.taskIdentifier ?? "Not attempted"} />
          <Fact term="Decision" value={view.decision.decision} />
          <Fact term="State mutation by model" value={view.decision.stateMutationAuthorized ? "Authorized" : "Not authorized"} />
          <Fact term="Customer release" value={view.decision.customerReleaseAuthorized ? "Authorized" : "Not authorized"} />
          <Fact term="Revision before" value={String(view.decision.revisionBefore ?? "Not attempted")} />
          <Fact term="Revision now" value={String(view.decision.revisionAfter ?? "Not attempted")} />
          <Fact term="Accepted fields" value={view.decision.acceptedFields.join(", ") || "None"} />
          <Fact term="Turn count" value={String(view.turns)} />
        </dl>
        {view.decision.failures.length ? (
          <p className="mt-4 rounded-lg border border-border bg-page px-3 py-2 text-xs leading-5 text-secondary">
            <span className="font-semibold text-primary">Validation failures:</span>{" "}
            {view.decision.failures.join(", ")}
          </p>
        ) : null}
        {audit.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <caption className="sr-only">Simulated AI turn audit trail</caption>
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">Turn</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Task</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Decision</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Revision</th>
                  <th scope="col" className="py-2 font-semibold">Applied</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.turn} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 text-secondary">{entry.turn}</td>
                    <td className="py-2 pr-4 text-secondary">{entry.taskIdentifier ?? "deterministic"}</td>
                    <td className="py-2 pr-4 text-secondary">{entry.decision}</td>
                    <td className="py-2 pr-4 text-secondary">{entry.revisionBefore} → {entry.revisionAfter}</td>
                    <td className="py-2 text-secondary">{entry.applied ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">No simulated turn has been recorded yet.</p>
        )}
      </section>

      {view.integration.status === "success" ? (
        <StageProgress activeStage={view.integration.readModel.stage} />
      ) : null}

      {view.error ? (
        <div role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span className="font-semibold">Simulated error:</span> {view.error}
        </div>
      ) : null}

      {projectionFailed ? (
        <div role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <span className="font-semibold">Projection unavailable:</span>{" "}
          The conversation read model failed closed. Reset the demonstration before continuing.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <ChatWindow
          messages={view.messages}
          onSubmit={submit}
          disabled={
            projectionFailed
            || busy
            || view.integration.status === "success"
              && (view.integration.readModel.stage === "handoff"
                || view.integration.readModel.stage === "completed")
          }
        />
        <aside className="space-y-5" aria-label="Simulated conversation details">
          <ConversationStatus
            view={view}
            aiDemo={{ decision: view.decision.decision, turns: view.turns }}
          />
          {view.integration.status === "success" ? (
            <DataPanels readModel={view.integration.readModel} />
          ) : null}
        </aside>
      </div>

      <HandoffPanel handoff={view.handoff} />
    </>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-secondary p-3">
      <dt className="text-xs text-muted">{term}</dt>
      <dd className="mt-1 font-semibold text-primary">{value}</dd>
    </div>
  );
}
