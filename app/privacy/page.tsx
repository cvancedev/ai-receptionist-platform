import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { branding } from "@/config/branding";

export const metadata: Metadata = {
  title: "Privacy",
  description: `A plain-language privacy notice for the current ${branding.productName} development-stage website.`,
};

const currentLimitations = [
  "Operate user accounts",
  "Use a contact form",
  "Process payments",
  "Intentionally collect sensitive customer data",
  "Provide the production AI receptionist service",
] as const;

export default function PrivacyPage() {
  return (
    <ContentPage
      eyebrow="Privacy notice"
      title="How information is handled on this development-stage website."
      introduction="This notice describes the current static website and email-based contact experience. It may be updated as the website and product develop."
    >
      <section aria-labelledby="collection-heading">
        <h2 id="collection-heading" className="text-2xl font-semibold text-primary">Current data collection</h2>
        <p className="mt-4 leading-7 text-secondary">As currently built, this website does not:</p>
        <ul className="mt-4 space-y-3">
          {currentLimitations.map((limitation) => (
            <li key={limitation} className="flex items-start gap-3 text-secondary">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-brand" />
              <span className="leading-7">{limitation}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="email-heading">
        <h2 id="email-heading" className="text-2xl font-semibold text-primary">Email contact</h2>
        <p className="mt-4 leading-7 text-secondary">
          If you contact us by email, we may use the information you voluntarily
          provide to respond to your inquiry, discuss possible early access, and
          improve our understanding of customer needs. Please do not email
          confidential, regulated, or sensitive personal information.
        </p>
      </section>

      <section aria-labelledby="technical-heading">
        <h2 id="technical-heading" className="text-2xl font-semibold text-primary">Technical information</h2>
        <p className="mt-4 leading-7 text-secondary">
          Hosting and network services may process standard technical
          information needed to deliver and protect the website. This may
          include an IP address, browser type, device information, and request
          logs.
        </p>
      </section>

      <section aria-labelledby="cookies-heading">
        <h2 id="cookies-heading" className="text-2xl font-semibold text-primary">Cookies and analytics</h2>
        <p className="mt-4 leading-7 text-secondary">
          The website currently does not intentionally use analytics or
          advertising cookies. This may change as the website develops, and
          this notice will be updated when appropriate.
        </p>
      </section>

      <section aria-labelledby="updates-heading">
        <h2 id="updates-heading" className="text-2xl font-semibold text-primary">Future updates</h2>
        <p className="mt-4 leading-7 text-secondary">
          We may revise this notice as the product, website, and information
          practices develop. The current version will remain available on this
          page.
        </p>
      </section>

      <section aria-labelledby="privacy-contact-heading">
        <h2 id="privacy-contact-heading" className="text-2xl font-semibold text-primary">Contact</h2>
        <address className="mt-4 not-italic text-secondary">
          Questions about this notice can be emailed to{" "}
          <a href={`mailto:${branding.supportEmail}`} className="rounded font-medium text-brand underline underline-offset-4 hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
            {branding.supportEmail}
          </a>.
        </address>
      </section>
    </ContentPage>
  );
}
