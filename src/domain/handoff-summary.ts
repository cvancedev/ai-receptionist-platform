export interface HandoffSummary {
  conversationId: string;
  businessProfileId: string;
  businessProfileVersion: number;
  stateRevision: number;
  customerName: string | null;
  requestedService: string | null;
  confirmedFacts: Readonly<Record<string, string>>;
  missingInformation: readonly string[];
  corrections: readonly string[];
  questionsAsked: readonly string[];
  escalationReason: string | null;
  completionStatus: string;
}
