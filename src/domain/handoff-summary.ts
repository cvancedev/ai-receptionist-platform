export interface HandoffSummary {
  customerName: string | null;
  requestedService: string | null;
  confirmedFacts: Readonly<Record<string, string>>;
  missingInformation: readonly string[];
  notes: readonly string[];
  escalationReason: string | null;
}
