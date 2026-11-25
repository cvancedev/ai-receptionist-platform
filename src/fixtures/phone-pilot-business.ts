import type { BusinessProfile } from "../domain/business-profile";
import type { KnowledgeRecord } from "../domain/knowledge-record";
import { LIFECYCLE_STATES } from "../shared/constants";

/**
 * The single business the telephone pilot answers for.
 *
 * It is a realistic small plumbing company rather than the earlier fictional
 * placeholder, because the pilot is demonstrated to prospective customers. Every
 * fact the receptionist may state lives in `phonePilotKnowledge`; nothing about
 * the business is hard-coded inside the call flow, so swapping this fixture is
 * the whole onboarding for a new pilot business.
 */
export const PHONE_PILOT_BUSINESS_ID = "northline-plumbing" as const;

export const phonePilotBusinessProfile: BusinessProfile = {
  id: PHONE_PILOT_BUSINESS_ID,
  version: 1,
  businessName: "Northline Plumbing & Drain",
  services: [
    {
      id: "emergency-leak-repair",
      name: "Emergency Leak Repair",
      description: "Urgent help for a leaking pipe, burst pipe, or active water damage.",
      aliases: ["emergency", "emergency repair", "leak", "leaking pipe", "burst pipe", "flooding"],
      status: "active",
      requiredIntakeFieldIds: ["caller-name", "callback-number", "issue-description"],
      optionalIntakeFieldIds: ["preferred-time"],
      unsupportedMessage: "An on-call manager needs to review this emergency request.",
    },
    {
      id: "drain-cleaning",
      name: "Drain Cleaning",
      description: "Clearing a clogged or slow drain in a home.",
      aliases: ["clog", "clogged drain", "slow drain", "blocked drain", "drain", "drain cleaning"],
      status: "active",
      requiredIntakeFieldIds: ["caller-name", "callback-number", "issue-description"],
      optionalIntakeFieldIds: ["preferred-time"],
      unsupportedMessage: "A team member needs to review this drain request.",
    },
    {
      id: "water-heater-repair",
      name: "Water Heater Repair",
      description: "Diagnosis and repair of a water heater that is not working properly.",
      aliases: ["water heater", "no hot water", "hot water", "heater repair"],
      status: "active",
      requiredIntakeFieldIds: ["caller-name", "callback-number", "issue-description"],
      optionalIntakeFieldIds: ["preferred-time"],
      unsupportedMessage: "A team member needs to review this water heater request.",
    },
  ],
  intakeRequirements: [
    {
      id: "caller-name",
      label: "Caller name",
      questionId: "ask-caller-name",
      question: "May I have your name, please?",
      required: true,
      fieldType: "text",
      serviceIds: [],
      confirmationBehavior: "application-confirmed",
      clarificationQuestion: "I'm sorry, could you repeat your name?",
    },
    {
      id: "callback-number",
      label: "Callback number",
      questionId: "ask-callback-number",
      question: "What's the best phone number to call you back on?",
      required: true,
      fieldType: "text",
      serviceIds: [],
      confirmationBehavior: "application-confirmed",
      clarificationQuestion: "I'm sorry, could you repeat that phone number?",
    },
    {
      id: "issue-description",
      label: "Issue description",
      questionId: "ask-issue-description",
      question: "Can you tell me a little about the problem you're having?",
      required: true,
      fieldType: "text",
      serviceIds: ["emergency-leak-repair", "drain-cleaning", "water-heater-repair"],
      confirmationBehavior: "application-confirmed",
      clarificationQuestion: "Could you describe the problem in a few words?",
    },
    {
      id: "preferred-time",
      label: "Preferred time",
      questionId: "ask-preferred-time",
      question: "Is there a day or time that works better for you?",
      required: false,
      fieldType: "text",
      serviceIds: ["emergency-leak-repair", "drain-cleaning", "water-heater-repair"],
      confirmationBehavior: "application-confirmed",
    },
  ],
  hours: {
    timeZone: "America/New_York",
    weeklySchedule: {
      monday: "7:00 AM-6:00 PM",
      tuesday: "7:00 AM-6:00 PM",
      wednesday: "7:00 AM-6:00 PM",
      thursday: "7:00 AM-6:00 PM",
      friday: "7:00 AM-6:00 PM",
      saturday: "8:00 AM-2:00 PM",
      sunday: "Closed",
    },
  },
  serviceArea: ["Springfield", "Riverton", "Oak Hill"],
  policies: [
    "A team member confirms the price before any work begins.",
    "No payment is ever collected over the phone.",
    "Requested times are preferences until a team member confirms them.",
  ],
  escalation: {
    destination: "Northline on-call manager",
    conditions: [
      "The caller asks to speak with a person.",
      "The request is an emergency, a complaint, or a commitment the receptionist cannot make.",
    ],
  },
  status: "active",
};

export const phonePilotKnowledge: readonly KnowledgeRecord[] = [
  {
    id: "northline-hours",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Regular Business Hours",
    category: "hours",
    content:
      "Northline Plumbing & Drain is open Monday through Friday, 7:00 AM to 6:00 PM, and Saturday, 8:00 AM to 2:00 PM. We are closed on Sunday.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline operations guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-service-area",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Service Area",
    category: "service-area",
    content:
      "Northline Plumbing & Drain serves Springfield, Riverton, and Oak Hill. We do not travel outside those towns.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline operations guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-diagnostic-fee",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Diagnostic Fee Policy",
    category: "pricing-policy",
    content:
      "Northline charges a flat $89 diagnostic fee for a service call. The fee is waived if the customer approves the repair during the same visit. The receptionist cannot quote any other price.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline pricing policy",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-emergency-policy",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "After-Hours Emergency Policy",
    category: "emergency-policy",
    content:
      "Outside business hours, an on-call manager handles emergency leaks and burst pipes. After-hours emergency work is billed at an overtime rate that the manager quotes before dispatch.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline operations guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-payment-methods",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Payment Methods",
    category: "payment-policy",
    content:
      "Northline accepts cash, check, and major credit cards. Payment is collected on site after the work is finished, never over the phone.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline pricing policy",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-warranty",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Workmanship Warranty",
    category: "warranty",
    content:
      "Northline warrants its workmanship for 12 months from the date of service. The warranty covers the labor Northline performed and does not cover manufacturer defects in parts.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline warranty terms",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-service-emergency-leak-repair",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Emergency Leak Repair",
    category: "service-description",
    content:
      "Northline repairs leaking and burst pipes, including active water damage, and prioritizes these calls ahead of routine work.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline service guide",
    effectiveDate: "2026-01-01",
  },
  {
    id: "northline-service-drain-cleaning",
    version: 1,
    businessProfileId: PHONE_PILOT_BUSINESS_ID,
    title: "Drain Cleaning",
    category: "service-description",
    content:
      "Northline clears clogged and slow drains in kitchens, bathrooms, and laundry rooms using a drain snake or jetter.",
    lifecycleState: LIFECYCLE_STATES.ACTIVE,
    audience: "customer",
    source: "Northline service guide",
    effectiveDate: "2026-01-01",
  },
];
