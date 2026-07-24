"use client";

import Link from "next/link";
import { useState } from "react";
import { ChatWindow } from "./ChatWindow";
import { ConversationStatus } from "./ConversationStatus";
import { DataPanels } from "./DataPanels";
import { HandoffPanel } from "./HandoffPanel";
import { StageProgress } from "./StageProgress";
import {
  createPrototypeChatSession,
} from "@/src/prototype-ui/prototype-chat-session";

export function PrototypeChat() {
  const [session] = useState(createPrototypeChatSession);
  const [view, setView] = useState(() => session.view());

  async function submit(message: string) {
    setView(await session.submit(message));
  }

  function reset() {
    setView(session.reset());
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
              Step through the local Business Profile-driven flow. Only the
              deterministic mock AI boundary is used; there is no real model,
              network request, persistence, or production customer data.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-lg border border-border bg-surface-primary px-4 py-2.5 text-sm font-semibold text-primary shadow-[var(--shadow-subtle)] hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Reset prototype
          </button>
        </header>

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
            {view.integration.errors.join(" ")
              || "The conversation read model failed closed."}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
          <ChatWindow
            messages={view.messages}
            onSubmit={submit}
            disabled={
              view.integration.status === "projection-failure"
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
      </div>
    </main>
  );
}
