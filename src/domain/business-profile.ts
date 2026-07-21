export type BusinessProfileStatus =
  | "draft"
  | "incomplete"
  | "ready-for-review"
  | "active"
  | "suspended"
  | "archived";

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  intakeRequirementIds: readonly string[];
}

export interface IntakeRequirement {
  id: string;
  label: string;
  required: boolean;
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
  intakeRequirements: readonly IntakeRequirement[];
  hours: BusinessHours;
  serviceArea: readonly string[];
  policies: readonly string[];
  escalation: EscalationConfiguration;
  status: BusinessProfileStatus;
}
