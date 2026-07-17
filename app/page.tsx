import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { branding } from "@/config/branding";

const principles = [
  {
    number: "01",
    title: "Answer consistently",
    description:
      "Designed to give every customer inquiry a clear, dependable first response.",
  },
  {
    number: "02",
    title: "Capture the important details",
    description:
      "Focus on the customer, the service they need, and how they prefer to be contacted.",
  },
  {
    number: "03",
    title: "Keep the owner informed",
    description:
      "Present each inquiry in a concise format so the next step is easy to understand.",
  },
] as const;

const inquiryDetails = [
  ["Customer name", "Jordan Lee"],
  ["Service requested", "Moving estimate"],
  ["Preferred contact", "Phone"],
] as const;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SiteHeader />
      <main className="flex-1">
        <section
          id="product"
          className="overflow-hidden border-b border-border bg-page py-16 sm:py-20 lg:py-28"
        >
          <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(25rem,0.98fr)] lg:gap-16">
            <div>
              <p className="inline-flex items-center rounded-full border border-border bg-brand-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                AI support for small businesses
              </p>
              <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-primary sm:text-5xl lg:text-[3.75rem]">
                Never let a valuable customer inquiry go unanswered.
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-secondary">
                We are developing a focused AI receptionist to help small
                service businesses capture customer inquiries and organize the
                details that matter—without adding another complicated system.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button href="#early-access">Request Early Access</Button>
                <Button href="#how-it-works" variant="secondary">
                  See How It Works
                </Button>
              </div>
              <p className="mt-5 flex max-w-xl items-start gap-2.5 text-sm leading-6 text-muted">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-success"
                />
                An early product being developed for small service businesses.
              </p>
            </div>

            <div
              className="relative mx-auto w-full max-w-xl lg:mx-0"
              role="group"
              aria-label="Illustrative customer inquiry preview"
            >
              <div
                aria-hidden="true"
                className="absolute -inset-6 z-0 rounded-[2rem] bg-brand-surface"
              />
              <div className="relative z-10 overflow-hidden rounded-[var(--radius-large)] border border-border bg-surface-primary shadow-[var(--shadow-stronger)]">
                <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-secondary px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      Illustrative preview
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-primary">
                      New customer inquiry
                    </h2>
                  </div>
                  <span className="rounded-full border border-border bg-surface-primary px-3 py-1 text-xs font-medium text-secondary">
                    Just now
                  </span>
                </div>
                <dl className="divide-y divide-border px-5 sm:px-6">
                  {inquiryDetails.map(([term, detail]) => (
                    <div
                      key={term}
                      className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4"
                    >
                      <dt className="text-sm text-muted">{term}</dt>
                      <dd className="text-sm font-medium text-primary">
                        {detail}
                      </dd>
                    </div>
                  ))}
                  <div className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
                    <dt className="text-sm text-muted">Status</dt>
                    <dd>
                      <span className="inline-flex items-center gap-2 rounded-full bg-brand-surface px-2.5 py-1 text-sm font-semibold text-brand">
                        <span
                          aria-hidden="true"
                          className="size-2 rounded-full bg-brand"
                        />
                        Needs review
                      </span>
                    </dd>
                  </div>
                </dl>
                <div className="border-t border-border bg-surface-secondary px-5 py-4 sm:px-6">
                  <p className="text-sm leading-6 text-secondary">
                    A simple example of how captured inquiry details could be
                    organized for review.
                  </p>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-8 bg-surface-primary py-16 sm:py-20 lg:py-24"
          aria-labelledby="principles-heading"
        >
          <Container>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand">
                A focused foundation
              </p>
              <h2
                id="principles-heading"
                className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-primary sm:text-4xl"
              >
                Built around the moments that matter.
              </h2>
              <p className="mt-4 text-lg leading-8 text-secondary">
                The first version is intentionally small: support the inquiry,
                preserve the important context, and make follow-up clearer.
              </p>
            </div>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {principles.map((principle) => (
                <li
                  key={principle.number}
                  className="rounded-[var(--radius-large)] border border-border bg-page p-6 shadow-[var(--shadow-subtle)] sm:p-7"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-brand-surface text-sm font-bold text-brand">
                    {principle.number}
                  </span>
                  <h3 className="mt-6 text-lg font-semibold text-primary">
                    {principle.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-secondary">
                    {principle.description}
                  </p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section
          id="early-access"
          className="scroll-mt-8 bg-page py-16 sm:py-20 lg:py-24"
          aria-labelledby="early-access-heading"
        >
          <Container>
            <div className="overflow-hidden rounded-[var(--radius-large)] bg-primary px-6 py-10 shadow-[var(--shadow-stronger)] sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-white/75">
                  Early product preview
                </p>
                <h2
                  id="early-access-heading"
                  className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl"
                >
                  Help shape a calmer way to handle new inquiries.
                </h2>
                <p className="mt-4 text-base leading-7 text-white/80">
                  We are building with small service businesses in mind. Get in
                  touch to follow development or share how missed inquiries
                  affect your team.
                </p>
              </div>
              <div className="mt-8 shrink-0 lg:mt-0">
                <Button
                  href={`mailto:${branding.salesEmail}`}
                  variant="secondary"
                  className="border-white bg-white text-primary hover:border-white hover:bg-blue-50"
                >
                  Request Early Access
                </Button>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
