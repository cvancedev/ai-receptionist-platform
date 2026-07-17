import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { Button } from "@/components/ui/Button";
import { branding } from "@/config/branding";

const pageTitle = "Early Access";
const pageDescription = `Learn about early-access conversations for ${branding.productName}, a product under development for small service businesses.`;

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  openGraph: {
    title: `${pageTitle} | ${branding.productName}`,
    description: pageDescription,
    siteName: branding.productName,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${pageTitle} | ${branding.productName}`,
    description: pageDescription,
  },
};

const participantTypes = [
  "Moving companies",
  "HVAC businesses",
  "Plumbing companies",
  "Electrical contractors",
  "Landscaping companies",
  "Other inquiry-driven service businesses",
] as const;

const possibleActivities = [
  "Discussing missed calls and customer inquiries",
  "Reviewing current intake and follow-up workflows",
  "Sharing feedback on product direction",
  "Potentially testing future product versions when they become available",
] as const;

export default function EarlyAccessPage() {
  const emailHref = `mailto:${branding.salesEmail}?subject=Early%20Access%20Interest`;

  return (
    <ContentPage
      eyebrow="Early access"
      title="Help shape a more dependable way to handle customer inquiries."
      introduction={`The ${branding.productName} is under active development. We are speaking with small service businesses to better understand how they handle new inquiries, missed calls, and follow-up today.`}
    >
      <section aria-labelledby="who-heading">
        <h2 id="who-heading" className="text-2xl font-semibold tracking-[-0.03em] text-primary sm:text-3xl">
          Who these conversations are for
        </h2>
        <p className="mt-4 text-base leading-7 text-secondary">
          We welcome interest from owners or managers who regularly handle
          customer inquiries and want to improve the experience for their team
          and customers. That may include:
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {participantTypes.map((participantType) => (
            <li key={participantType} className="flex items-start gap-3 rounded-[var(--radius-standard)] border border-border bg-surface-primary px-4 py-3 text-sm leading-6 text-secondary">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
              {participantType}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6 text-muted">
          Expressing interest starts a conversation; it does not guarantee
          participation or access.
        </p>
      </section>

      <section aria-labelledby="participation-heading">
        <h2 id="participation-heading" className="text-2xl font-semibold tracking-[-0.03em] text-primary sm:text-3xl">
          What participation may involve
        </h2>
        <p className="mt-4 text-base leading-7 text-secondary">
          Depending on the business and the stage of development, an
          early-access conversation may include:
        </p>
        <ul className="mt-5 space-y-3">
          {possibleActivities.map((activity) => (
            <li key={activity} className="flex items-start gap-3 text-secondary">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-success" />
              <span className="leading-7">{activity}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="contact-heading" className="rounded-[var(--radius-large)] bg-primary px-6 py-8 shadow-[var(--shadow-stronger)] sm:px-8 sm:py-10">
        <h2 id="contact-heading" className="text-2xl font-semibold tracking-[-0.03em] text-white sm:text-3xl">
          Start a conversation
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">
          Tell us briefly about your business and how your team handles new
          customer inquiries. Your email application will open with the subject
          “Early Access Interest.”
        </p>
        <address className="mt-6 not-italic">
          <Button href={emailHref} variant="secondary" className="max-w-full break-all border-white bg-white text-primary hover:border-white hover:bg-blue-50">
            Email {branding.salesEmail}
          </Button>
        </address>
      </section>

      <section aria-labelledby="disclosure-heading" className="rounded-[var(--radius-large)] border border-border bg-brand-surface p-6 sm:p-8">
        <h2 id="disclosure-heading" className="text-xl font-semibold tracking-[-0.02em] text-primary">
          A clear note about early access
        </h2>
        <p className="mt-3 text-sm leading-6 text-secondary">
          The product is under development, features may change, and expressing
          interest does not guarantee access. Please do not email confidential
          or sensitive customer information.
        </p>
      </section>
    </ContentPage>
  );
}
