import type { KnowledgeRecord } from "../domain/knowledge-record";
import { LIFECYCLE_STATES } from "../shared/constants";

export const fictionalKnowledgeRecords: readonly KnowledgeRecord[] = [
  {
    id: "service-home-project-consultation",
    version: 1,
    businessProfileId: "friendly-home-services",
    title: "Home Project Consultation",
    category: "service-description",
    content:
      "Friendly Home Services offers a consultation to understand household service requests and prepare a team follow-up.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Fictional business-approved service guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "regular-hours",
    version: 1,
    businessProfileId: "friendly-home-services",
    title: "Regular Business Hours",
    category: "hours",
    content:
      "The fictional customer care team is available Monday-Friday, 8:00 AM-5:00 PM Eastern Time.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Fictional business-approved operations guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "payment-policy",
    version: 1,
    businessProfileId: "friendly-home-services",
    title: "Payment Policy",
    category: "payment-policy",
    content:
      "A team member confirms applicable payment details before any fictional service begins.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Fictional business-approved policy guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "appointment-expectations",
    version: 1,
    businessProfileId: "friendly-home-services",
    title: "Appointment Expectations",
    category: "appointment-expectations",
    content:
      "A requested date remains a preference until the fictional customer care team confirms availability.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Fictional business-approved scheduling guide",
    effectiveDate: "2026-01-01",
  },
];
