import type { StateExecutionResult } from "../execution/contracts";
import { deepFreeze } from "../shared/immutable";
import type {
  ExecutionJournalAppendResult,
  ExecutionJournalEntry,
  ExecutionJournalSnapshot,
  ExecutionJournalStore,
  ExecutionJournalStoreScope,
} from "./contracts";
import {
  cloneExecutionJournalEntry,
  createExecutionJournalEntry,
  isValidJournalScope,
  prepareExecutionJournalEntry,
} from "./entry-mapper";

export class InMemoryExecutionJournal
implements ExecutionJournalStore<"synchronous"> {
  readonly operationMode = "synchronous";
  private readonly entries: Readonly<ExecutionJournalEntry>[] = [];

  append(result: StateExecutionResult): ExecutionJournalAppendResult {
    const prepared = prepareExecutionJournalEntry(result);
    if (prepared.status === "failure") return prepared;
    const sequence = this.entries.length + 1;
    const entry = createExecutionJournalEntry(prepared.draft, sequence);
    this.entries.push(entry);
    return deepFreeze({ status: "success", entry });
  }

  snapshot(
    scope: Readonly<ExecutionJournalStoreScope>,
  ): ExecutionJournalSnapshot {
    if (!isValidJournalScope(scope)) {
      return deepFreeze({ entries: [], failure: "InvalidJournalScope" });
    }
    return deepFreeze({
      entries: this.entries
        .filter((entry) => matchesScope(entry, scope))
        .map(cloneExecutionJournalEntry),
    });
  }
}

function matchesScope(
  entry: Readonly<ExecutionJournalEntry>,
  scope: Readonly<ExecutionJournalStoreScope>,
): boolean {
  return entry.conversationId === scope.conversationId
    && entry.businessProfileId === scope.businessProfileId
    && entry.businessProfileVersion === scope.businessProfileVersion;
}
