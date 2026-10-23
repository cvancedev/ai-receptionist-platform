"use client";

import Link from "next/link";
import { useState } from "react";
import { AiDemoChatPanel } from "./AiDemoChatPanel";
import { ChatWindow } from "./ChatWindow";
import { ConversationStatus } from "./ConversationStatus";
import { DataPanels } from "./DataPanels";
import { HandoffPanel } from "./HandoffPanel";
import { StageProgress } from "./StageProgress";
import {
  createPrototypeChatSession,
} from "@/src/prototype-ui/prototype-chat-session";
import {
  AI_SIMULATED_MODE_ENABLED_BY_DEFAULT,
} from "@/src/prototype-ui/prototype-experience-mode";

export function PrototypeChat() {
  const [session] = useState(createPrototypeChatSession);
  const [view, setView] = useState(() => session.view());
  const [mode, setMode] = useState<"fixture" | "durable-activated">("fixture");
  const [aiDemo, setAiDemo] = useState(AI_SIMULATED_MODE_ENABLED_BY_DEFAULT);
  const [aiPanelKey, setAiPanelKey] = useState(0);
  const [busy, setBusy] = useState(false);

  async function submit(message: string) {
    if (busy) return;
    setBusy(true);
    try {
      setView(await session.submit(message));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setView(session.reset());
    setAiPanelKey((key) => key + 1);
  }

  return (
    <main className="min-h-screen bg-page px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[90rem]">
        <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/"
              className="text-sm font-semibold text-brand underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
            >
              Return to validation website
            </Link>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-brand">
              Developer prototype · fictional data only
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-primary sm:text-4xl">
              Deterministic intake workspace
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-secondary sm:text-base">
              Step through the local Business Profile-driven flow. Only deterministic
              and simulated AI boundaries are used; there is no real model, network
              request, persistence, or production customer data.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={mode !== "fixture" || busy}
            aria-describedby="prototype-operation-status"
            className="min-h-11 rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm font-semibold text-primary shadow-[var(--shadow-subtle)] hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Reset prototype
          </button>
        </header>

        <fieldset className="mt-6 rounded-2xl border border-border bg-surface-primary p-4 shadow-[var(--shadow-subtle)] sm:p-5">
          <legend className="px-1 text-sm font-semibold text-primary">Experience mode</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeOption checked={!aiDemo && mode === "fixture"} disabled={busy} description="The certified in-memory regression and demonstration flow." label="Fixture-backed deterministic" onChange={() => { setAiDemo(false); setMode("fixture"); }} value="fixture" />
            <ModeOption checked={aiDemo} disabled={busy} description="Offline simulated language layer. No provider, network, credential, or customer release." label="AI-assisted (simulated)" onChange={() => { setAiDemo(true); setMode("fixture"); }} value="ai-simulated" />
            <ModeOption checked={!aiDemo && mode === "durable-activated"} disabled={busy} description="Requires an explicitly injected activated PostgreSQL runtime; never uses fixtures." label="Durable activated" onChange={() => { setAiDemo(false); setMode("durable-activated"); }} value="durable-activated" />
          </div>
        </fieldset>

        <p className="sr-only" role="status" aria-live="polite">
          {aiDemo
            ? "Simulated AI mode selected. No provider or network is connected."
            : mode === "fixture"
              ? "Fixture-backed deterministic mode selected."
              : "Durable activated mode selected. No runtime is connected in this local browser surface."}
        </p>
        <p id="prototype-operation-status" className="sr-only" role="status" aria-live="polite">
          {busy ? "A fictional operation is in progress." : "No fictional operation is in progress."}
        </p>

        {aiDemo ? <AiDemoChatPanel key={aiPanelKey} /> : mode === "durable-activated" ? <DurableActivatedBoundary /> : <>

        {view.integration.status === "success" ? (
          <StageProgress activeStage={view.integration.readModel.stage} />
        ) : null}

        {view.error ? (
          <div role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span className="font-semibold">Deterministic error:</span> {view.error}
          </div>
        ) : null}

        {view.integration.status === "projection-failure" ? (
          <div role="alert" className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <span className="font-semibold">Projection unavailable:</span>{" "}
            The conversation read model failed closed. Reset the prototype before continuing.
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
          <ChatWindow
            messages={view.messages}
            onSubmit={submit}
            disabled={
              view.integration.status === "projection-failure"
              || busy
              || view.integration.readModel.stage === "handoff"
              || view.integration.readModel.stage === "completed"
            }
          />
          <aside className="space-y-5" aria-label="Conversation debugging details">
            <ConversationStatus view={view} />
            {view.integration.status === "success" ? (
              <DataPanels readModel={view.integration.readModel} />
            ) : null}
          </aside>
        </div>

        <HandoffPanel handoff={view.handoff} />
        </>}
      </div>
    </main>
  );
}

function ModeOption({ checked, disabled, description, label, onChange, value }: {
  checked: boolean;
  disabled: boolean;
  description: string;
  label: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label className={`flex min-h-20 items-start gap-3 rounded-xl border p-4 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${checked ? "border-brand bg-brand-surface" : "border-border bg-page"}`}>
      <input className="mt-1 size-4 accent-[var(--brand-primary)]" type="radio" name="experience-mode" value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span><span className="block text-sm font-semibold text-primary">{label}</span><span className="mt-1 block text-xs leading-5 text-secondary">{description}</span></span>
    </label>
  );
}

function DurableActivatedBoundary() {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface-primary p-5 shadow-[var(--shadow-subtle)] sm:p-6" aria-labelledby="durable-heading">
      <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="font-semibold">Durable runtime not connected.</span>{" "}This browser surface fails closed instead of substituting fixture data.
      </div>
      <h2 id="durable-heading" className="mt-5 text-lg font-semibold text-primary">Durable activated boundary</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary">
        The opt-in application runtime must resolve an exact active profile and knowledge set, recover the pinned conversation, and return only bounded conversation, progress, failure, and handoff read models. Database records and internal execution payloads are never rendered here.
      </p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <BoundaryFact term="Fixture fallback" value="Prohibited" />
        <BoundaryFact term="Customer release" value="Not authorized" />
        <BoundaryFact term="External actions" value="Not authorized" />
      </dl>
    </section>
  );
}

function BoundaryFact({ term, value }: { term: string; value: string }) {
  return <div className="rounded-lg bg-surface-secondary p-3"><dt className="text-xs text-muted">{term}</dt><dd className="mt-1 font-semibold text-primary">{value}</dd></div>;
}
