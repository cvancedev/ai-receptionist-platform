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
      aliases: ["project help", "home consultation", "consultation"],
      status: "active",
      requiredIntakeFieldIds: ["project-description", "service-location"],
      optionalIntakeFieldIds: ["preferred-date"],
      unsupportedMessage: "This request needs review by the fictional customer care team.",
    },
    {
      id: "seasonal-home-check-in",
      name: "Seasonal Home Check-In",
      description:
        "A fictional seasonal visit for reviewing routine household service needs.",
      aliases: ["seasonal service", "home check-in", "consultation"],
      status: "active",
      requiredIntakeFieldIds: ["property-notes"],
      optionalIntakeFieldIds: ["preferred-date"],
      unsupportedMessage: "This request needs review by the fictional customer care team.",
    },
    {
      id: "inactive-fixture-service",
      name: "Inactive Fixture Service",
      description: "A deliberately unavailable fictional service used only for verification.",
      aliases: ["archived help"],
      status: "inactive",
      requiredIntakeFieldIds: [],
      optionalIntakeFieldIds: [],
      unsupportedMessage: "This fictional service is not currently available.",
    },
  ],
  intakeRequirements: [
    { id: "customer-name", label: "Customer name", questionId: "ask-customer-name", question: "What name should the fictional team use?", required: true, fieldType: "text", serviceIds: [], confirmationBehavior: "application-confirmed", clarificationQuestion: "What is the corrected customer name?" },
    { id: "contact-method", label: "Preferred contact method", questionId: "ask-contact-method", question: "What contact method should the fictional team use?", required: true, fieldType: "text", serviceIds: [], confirmationBehavior: "application-confirmed" },
    { id: "project-description", label: "Project description", questionId: "ask-project-description", question: "Please briefly describe the fictional home project.", required: true, fieldType: "text", serviceIds: ["home-project-consultation"], confirmationBehavior: "application-confirmed" },
    { id: "service-location", label: "Service location", questionId: "ask-service-location", question: "Which fictional service area is the project in?", required: true, fieldType: "text", serviceIds: ["home-project-consultation"], confirmationBehavior: "application-confirmed", clarificationQuestion: "What is the corrected fictional service location?" },
    { id: "property-notes", label: "Property notes", questionId: "ask-property-notes", question: "What should the fictional team know about the property?", required: true, fieldType: "text", serviceIds: ["seasonal-home-check-in"], confirmationBehavior: "application-confirmed" },
    { id: "preferred-date", label: "Preferred date", questionId: "ask-preferred-date", question: "Is there a fictional preferred date?", required: false, fieldType: "text", serviceIds: ["home-project-consultation", "seasonal-home-check-in"], confirmationBehavior: "application-confirmed" },
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
