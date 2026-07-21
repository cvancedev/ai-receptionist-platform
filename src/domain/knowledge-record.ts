import type { LifecycleState } from "../shared/constants";

export type KnowledgeAudience = "customer" | "staff" | "both";

export interface KnowledgeRecord {
  id: string;
  version: number;
  businessProfileId: string;
  title: string;
  category: string;
  content: string;
  lifecycleState: LifecycleState;
  audience: KnowledgeAudience;
  source: string;
  effectiveDate: string;
}
