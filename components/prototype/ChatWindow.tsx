import { useState, type FormEvent } from "react";
import type { PrototypeMessage } from "@/src/prototype-ui/prototype-chat-session";

export function ChatWindow({
  messages,
  onSubmit,
  disabled,
}: {
  messages: readonly PrototypeMessage[];
  onSubmit: (message: string) => void;
  disabled: boolean;
}) {
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    onSubmit(value);
    setMessage("");
  }

  return (
    <section className="flex min-h-[38rem] flex-col overflow-hidden rounded-2xl border border-border bg-surface-primary shadow-[var(--shadow-subtle)]" aria-labelledby="chat-heading">
      <div className="border-b border-border bg-surface-secondary px-5 py-4 sm:px-6">
        <h2 id="chat-heading" className="font-semibold text-primary">Fictional conversation</h2>
        <p className="mt-1 text-xs text-muted">Messages are numbered rather than timestamped so runs remain deterministic.</p>
      </div>
      <ol className="flex-1 space-y-4 overflow-y-auto p-5 sm:p-6" aria-live="polite" aria-label="Prototype messages">
        {messages.map((item) => (
          <li key={item.id} className={`flex ${item.role === "customer" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${item.role === "customer" ? "bg-brand text-white" : "border border-border bg-page text-primary"}`}>
              <p className={`mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em] ${item.role === "customer" ? "text-white/75" : "text-muted"}`}>
                {item.role} · {item.id}
              </p>
              <p>{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <form onSubmit={submit} className="border-t border-border p-4 sm:p-5">
        <label htmlFor="prototype-message" className="text-sm font-semibold text-primary">Fictional customer message</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="prototype-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={disabled}
            placeholder={disabled ? "Reset to begin another scenario" : "Type a fictional response"}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-white px-3.5 py-2 text-sm text-primary placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-secondary"
          />
          <button type="submit" disabled={disabled || !message.trim()} className="min-h-11 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50">
            Submit
          </button>
        </div>
      </form>
    </section>
  );
}
