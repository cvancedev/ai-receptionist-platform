# Universal Intake

## Purpose

Universal intake defines the minimum categories of context needed to understand and hand off an inquiry for a small service business. It is a conversation blueprint, not a form, schema, or implementation specification.

The AI Core supplies the intake behavior. The Business Profile defines the business's configured services, terminology, required fields, optional fields, contextual fields, and customer-defined workflows. The conversation should gather only information that helps the business respond.

## Information Status

- **Required:** Needed before the inquiry can be considered complete under the applicable Business Profile.
- **Optional:** Helpful when the customer knows it, but not necessary to continue.
- **Contextual:** Needed only when a configured service, business rule, or earlier answer makes it relevant.

Exact status is business-configured. The platform should support these statuses without imposing industry-specific requirements.

## Customer

- **Name:** Identifies the customer and gives the inquiry a clear human reference.
- **Reachable contact method:** At least one approved way for the business to continue the conversation, such as phone or email.
- **Additional contact details:** Collected only when the Business Profile or customer's preference makes them relevant.

## Request

- **Configured service:** The closest business-defined service when it can be identified confidently.
- **Request description:** What the customer wants help with, in the customer's own words.
- **Customer goal:** The outcome the customer is trying to achieve.

If the request does not match a configured service, the AI preserves the customer's description and follows the profile's review or escalation path instead of forcing a category.

## Location

- **Relevant location:** Collected when the configured service or workflow depends on where work, delivery, pickup, travel, or another activity occurs.
- **Additional locations:** Collected only when a customer-defined workflow requires them.

The AI Core does not assume a number or type of locations. Their labels and requirements come from the Business Profile.

## Scheduling

- **Preferred date or time frame:** Helps the business understand timing without promising availability.
- **Urgency:** Collected when timing affects the request, safety, or applicable workflow.

Scheduling questions and approved availability language come from the Business Profile.

## Communication

- **Preferred contact method:** Records how the customer would like the business to follow up, subject to configured channels.
- **Communication considerations:** Captured only when volunteered or needed to support an accessible, effective handoff.

## Notes

- **Special concerns:** Constraints, risks, sensitivities, or priorities the customer wants the business to understand.
- **Additional context:** Other information that materially improves the business's response.

## Completion Standard

An intake is complete when the Business Profile's required information is present, applicable contextual information has been addressed, uncertainty is visible, the customer has had a chance to correct the summary, and the approved next step is clear. Incomplete, escalated, and abandoned outcomes are governed by [Conversation Completion](CONVERSATION_COMPLETION.md).

The AI should not invent missing details, force optional answers, apply an industry assumption, promise an outcome, or make decisions reserved for human staff.
