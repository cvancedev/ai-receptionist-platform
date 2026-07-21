import type { BusinessProfile } from "../domain/business-profile";

export const fictionalBusinessProfile: BusinessProfile = {
  id: "friendly-home-services",
  version: 1,
  businessName: "Friendly Home Services",
  services: [
    {
      id: "home-project-consultation",
      name: "Home Project Consultation",
      description:
        "A conversation to understand a customer's household service request and next steps.",
      intakeRequirementIds: [
        "customer-name",
        "contact-method",
        "project-description",
      ],
    },
    {
      id: "seasonal-home-check-in",
      name: "Seasonal Home Check-In",
      description:
        "A fictional seasonal visit for reviewing routine household service needs.",
      intakeRequirementIds: [
        "customer-name",
        "contact-method",
        "preferred-date",
      ],
    },
  ],
  intakeRequirements: [
    { id: "customer-name", label: "Customer name", required: true },
    { id: "contact-method", label: "Preferred contact method", required: true },
    { id: "project-description", label: "Project description", required: true },
    { id: "preferred-date", label: "Preferred date", required: false },
  ],
  hours: {
    timeZone: "America/New_York",
    weeklySchedule: {
      monday: "8:00 AM-5:00 PM",
      tuesday: "8:00 AM-5:00 PM",
      wednesday: "8:00 AM-5:00 PM",
      thursday: "8:00 AM-5:00 PM",
      friday: "8:00 AM-5:00 PM",
      saturday: "Closed",
      sunday: "Closed",
    },
  },
  serviceArea: ["North Harbor", "Maple Glen", "Pine Crossing"],
  policies: [
    "Payment details are confirmed by a team member before work begins.",
    "Requested dates are preferences until a team member confirms availability.",
  ],
  escalation: {
    destination: "Fictional customer care team",
    conditions: [
      "The customer asks to speak with a person.",
      "The request involves an emergency, complaint, or unsupported commitment.",
    ],
  },
  status: "active",
};
