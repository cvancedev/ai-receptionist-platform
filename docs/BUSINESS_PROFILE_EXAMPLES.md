# Business Profile Examples

## Purpose and Limits

The following profiles are fictional illustrations created only to demonstrate the architecture. The names, services, fields, policies, hours, and workflows are not real business information and are not platform defaults.

Each example uses the same industry-agnostic AI Core. Supporting a different business changes only the customer-owned Business Profile; no platform-core change is required.

## Example 1: Fictional Home Repair Service

### Business Identity

- **Name:** Example Home Repair Co.
- **Description:** A fictional local business handling approved residential repair requests.
- **Industry label:** Home repair
- **Time zone:** The business's configured local time zone

### Services

- Minor interior repairs — active
- Exterior repair assessment — active
- Requests outside the configured services — human review

### Hours and Service Area

- Weekday daytime hours configured by the business
- No emergency availability
- Customer-defined local service area; uncertain addresses require staff review

### Intake Fields

- Customer name and reachable contact method
- Requested service or plain-language problem description
- Work location
- Preferred time frame
- Conditional property-access or safety details when relevant

### FAQs

- Approved explanation of the assessment process
- Approved description of the configured service area
- No price or availability promise without staff review

### Escalation Rules

- Active leak, electrical danger, structural concern, or another immediate hazard
- Request outside configured services or service area
- Pricing exception, complaint, or customer request for a person

### Tone

Calm, practical, respectful, and reassuring without minimizing safety concerns.

### Handoff Destination

Routine inquiries go to the fictional service coordinator. Safety concerns and complaints use the configured priority human route.

## Example 2: Fictional Pet-Care Business

### Business Identity

- **Name:** Example Neighborhood Pet Care
- **Description:** A fictional business offering configured non-medical pet-care services.
- **Industry label:** Pet care
- **Time zone:** The business's configured local time zone

### Services

- Scheduled pet visits — active
- Dog walking — active
- Medical, veterinary, or unsupported animal-care requests — human escalation

### Hours and Service Area

- Daily visit windows configured by the business
- No medical emergency service
- Customer-defined neighborhood coverage area

### Intake Fields

- Customer name and reachable contact method
- Configured service and preferred dates
- Service location
- Pet type, number of pets, and relevant care routine
- Conditional behavior, access, or medication context for human review

### FAQs

- Approved visit-window explanation
- Approved policy for introductions before service
- Approved list of supported pet-care activities

### Escalation Rules

- Illness, injury, missing animal, bite risk, or urgent safety concern
- Medication request outside approved policy
- Schedule exception, complaint, or unclear care requirements

### Tone

Warm, patient, attentive, and professional without offering medical advice.

### Handoff Destination

Routine inquiries go to the fictional scheduling team. Safety or medical concerns use the configured urgent human route and platform safety safeguards.

## Example 3: Fictional Professional Service Business

### Business Identity

- **Name:** Example Advisory Office
- **Description:** A fictional office providing configured general business-consulting services.
- **Industry label:** Professional services
- **Time zone:** The business's configured local time zone

### Services

- Introductory consultation request — active
- Existing-client administrative inquiry — active
- Legal, financial, or regulated advice request — human escalation and no substantive AI answer

### Hours and Service Area

- Weekday office hours configured by the business
- No emergency availability
- Remote service area defined by the business's approved operating boundaries

### Intake Fields

- Customer name, organization when relevant, and reachable contact method
- General objective and requested service
- Preferred consultation time frame
- Conditional deadline, stakeholder, or existing-client context
- No unnecessary confidential details during initial intake

### FAQs

- Approved description of the introductory process
- Approved explanation of service scope
- Approved administrative contact methods

### Escalation Rules

- Request for regulated, legal, financial, or other unsupported advice
- Confidential or sensitive matter requiring controlled handling
- Contract, pricing exception, complaint, or request for a specific professional

### Tone

Clear, composed, discreet, and helpful without sounding technical or implying an adviser-client commitment.

### Handoff Destination

New inquiries go to the fictional client-services coordinator. Existing-client, sensitive, and exception paths use their separately configured destinations.

## Cross-Example Comparison

Across all three examples, the AI Core still listens, clarifies, collects relevant information, confirms understanding, summarizes, explains an approved next step, and escalates when authority or knowledge is insufficient.

Only configuration changes:

- Business identity and tone
- Customer-defined services
- Hours and service area
- Intake fields and completion rules
- Approved knowledge
- Escalation conditions
- Human handoff destinations

The industry label remains descriptive. It never generates a questionnaire, policy, answer, or workflow.
