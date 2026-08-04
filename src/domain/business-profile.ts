export const BUSINESS_PROFILE_STATUSES = [
  "draft",
  "incomplete",
  "ready-for-review",
  "active",
  "suspended",
  "archived",
] as const;

export type BusinessProfileStatus =
  (typeof BUSINESS_PROFILE_STATUSES)[number];

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  aliases: readonly string[];
  status: "active" | "inactive";
  requiredIntakeFieldIds: readonly string[];
  optionalIntakeFieldIds: readonly string[];
  unsupportedMessage: string;
}

export type IntakeFieldType = "text" | "service";

export interface IntakeFieldDefinition {
  id: string;
  label: string;
  questionId: string;
  question: string;
  required: boolean;
  fieldType: IntakeFieldType;
  serviceIds: readonly string[];
  confirmationBehavior: "application-confirmed";
  clarificationQuestion?: string;
}

export interface BusinessHours {
  timeZone: string;
  weeklySchedule: Readonly<Record<string, string>>;
}

export interface EscalationConfiguration {
  destination: string;
  conditions: readonly string[];
}

export interface BusinessProfile {
  id: string;
  version: number;
  businessName: string;
  services: readonly ServiceDefinition[];
  intakeRequirements: readonly IntakeFieldDefinition[];
  hours: BusinessHours;
  serviceArea: readonly string[];
  policies: readonly string[];
  escalation: EscalationConfiguration;
  status: BusinessProfileStatus;
}
