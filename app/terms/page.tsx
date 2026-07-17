import type { Metadata } from "next";
import { ContentPage } from "@/components/layout/ContentPage";
import { branding } from "@/config/branding";

export const metadata: Metadata = {
  title: "Terms",
  description: `Plain-language terms for the current ${branding.productName} development-stage website.`,
};

const unacceptableUses = [
  "Attempt to disrupt, damage, or misuse the website",
  "Submit or transmit unlawful content",
  "Impersonate another person or business",
  "Send confidential or sensitive third-party information through email contact",
] as const;

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Website terms"
      title="Terms for using this development-stage website."
      introduction={`These terms apply to the current ${branding.productName} informational website. The site describes a product that is still under development.`}
    >
      <section aria-labelledby="purpose-heading">
        <h2 id="purpose-heading" className="text-2xl font-semibold text-primary">Informational purpose</h2>
        <p className="mt-4 leading-7 text-secondary">
          The website shares the intended direction of a product under
          development. Its content is provided for general informational and
          customer-validation purposes.
        </p>
      </section>

      <section aria-labelledby="commitment-heading">
        <h2 id="commitment-heading" className="text-2xl font-semibold text-primary">No service commitment</h2>
        <p className="mt-4 leading-7 text-secondary">
          A production service is not currently guaranteed. Features and
          timelines may change as development continues. Expressing
          early-access interest or discussing the product does not by itself
          create a customer relationship or guarantee future access.
        </p>
      </section>

      <section aria-labelledby="use-heading">
        <h2 id="use-heading" className="text-2xl font-semibold text-primary">Acceptable use</h2>
        <p className="mt-4 leading-7 text-secondary">Visitors must not:</p>
        <ul className="mt-4 space-y-3">
          {unacceptableUses.map((use) => (
            <li key={use} className="flex items-start gap-3 text-secondary">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-brand" />
              <span className="leading-7">{use}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="property-heading">
        <h2 id="property-heading" className="text-2xl font-semibold text-primary">Intellectual property</h2>
        <p className="mt-4 leading-7 text-secondary">
          Unless otherwise stated, the website content, branding, and original
          materials belong to {branding.copyrightOwner}. Third-party names,
          technologies, and materials remain the property of their respective
          owners.
        </p>
      </section>

      <section aria-labelledby="disclaimer-heading">
        <h2 id="disclaimer-heading" className="text-2xl font-semibold text-primary">Disclaimer</h2>
        <p className="mt-4 leading-7 text-secondary">
          We aim to keep the website useful and current, but information may be
          incomplete or change during development. Website availability may
          also be interrupted. Visitors should not rely on the site as a promise
          that a feature, service, or timeline will be delivered.
        </p>
      </section>

      <section aria-labelledby="changes-heading">
        <h2 id="changes-heading" className="text-2xl font-semibold text-primary">Changes</h2>
        <p className="mt-4 leading-7 text-secondary">
          These terms may be revised as the project and website develop. The
          current version will remain available on this page.
        </p>
      </section>

      <section aria-labelledby="terms-contact-heading">
        <h2 id="terms-contact-heading" className="text-2xl font-semibold text-primary">Contact</h2>
        <address className="mt-4 not-italic text-secondary">
          Questions about these terms can be emailed to{" "}
          <a href={`mailto:${branding.supportEmail}`} className="rounded font-medium text-brand underline underline-offset-4 hover:text-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
            {branding.supportEmail}
          </a>.
        </address>
      </section>
    </ContentPage>
  );
}
