import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { branding } from "@/config/branding";

const busyMoments = [
  ["On a job site", "The team is focused on the customer in front of them."],
  [
    "Between appointments",
    "Details can be rushed, scattered, or easy to overlook.",
  ],
  [
    "After business hours",
    "A new inquiry may wait until the next working day.",
  ],
] as const;

const problems = [
  {
    number: "01",
    title: "Missed inquiries",
    description:
      "When no one can respond, a ready-to-hire customer may move on or wait without knowing what happens next.",
  },
  {
    number: "02",
    title: "Incomplete details",
    description:
      "A name and callback number may not give the team enough context to understand the request or prepare a useful response.",
  },
  {
    number: "03",
    title: "Delayed follow-up",
    description:
      "When details live in voicemail, notes, or memory, the next step can be easy to overlook during a busy day.",
  },
] as const;

const workflow = [
  {
    number: "1",
    title: "A customer reaches out",
    description:
      "A new or returning customer contacts the business with a service request or question.",
  },
  {
    number: "2",
    title: "Important details are organized",
    description:
      "The planned receptionist gathers the customer, service, timing, and contact information the business needs.",
  },
  {
    number: "3",
    title: "The owner gets a clear summary",
    description:
      "The intended handoff shows what the customer needs and what may require the team’s attention next.",
  },
] as const;

const trustPrinciples = [
  {
    title: "Dependable",
    description:
      "Designed around consistent inquiry handling and clear next steps, not novelty for its own sake.",
  },
  {
    title: "Simple",
    description:
      "Important information should be easy to scan, understand, and act on during a busy day.",
  },
  {
    title: "Respectful of customers",
    description:
      "Customer interactions should feel clear, helpful, and appropriate for the business they contacted.",
  },
  {
    title: "Built for human oversight",
    description:
      "Owners and staff stay responsible for judgment, customer relationships, and the final follow-up.",
  },
] as const;

const inquiryDetails = [
  ["Customer name", "Jordan Lee"],
  ["Service request", "Moving estimate"],
  ["Preferred contact", "Phone"],
  ["Time received", "Today, 4:18 PM"],
] as const;

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SiteHeader />
      <main className="flex-1">
        <section className="overflow-hidden border-b border-border bg-page py-16 sm:py-20 lg:py-28">
          <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(23rem,0.92fr)] lg:gap-16">
            <div>
              <p className="inline-flex items-center rounded-full border border-border bg-brand-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                AI support for small service businesses
              </p>
              <h1 className="mt-6 max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-primary sm:text-5xl lg:text-[3.75rem]">
                Never let another valuable customer inquiry slip through the
                cracks.
              </h1>
              <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-secondary">
                We are developing a focused AI receptionist to help busy
                service businesses respond more consistently, capture the
                details that matter, and keep owners informed.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button href={`mailto:${branding.salesEmail}`}>
                  Request Early Access
                </Button>
                <Button href="#workflow" variant="secondary">
                  See How It Works
                </Button>
              </div>
              <p className="mt-5 flex max-w-xl items-start gap-2.5 text-sm leading-6 text-muted">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-success"
                />
                This product is under active development for owners and
                managers of small service businesses.
              </p>
            </div>

            <aside
              className="relative mx-auto w-full max-w-lg lg:mx-0"
              aria-labelledby="busy-work-heading"
            >
              <div
                aria-hidden="true"
                className="absolute -inset-6 z-0 rounded-[2rem] bg-brand-surface"
              />
              <div className="relative z-10 rounded-[var(--radius-large)] border border-border bg-surface-primary p-6 shadow-[var(--shadow-stronger)] sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                  Built around real service work
                </p>
                <h2
                  id="busy-work-heading"
                  className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-primary"
                >
                  Your work keeps moving. New inquiries do too.
                </h2>
                <ul className="mt-6 divide-y divide-border">
                  {busyMoments.map(([title, description]) => (
                    <li key={title} className="flex gap-4 py-4 first:pt-0">
                      <span
                        aria-hidden="true"
                        className="mt-2 size-2 shrink-0 rounded-full bg-brand"
                      />
                      <div>
                        <p className="font-semibold text-primary">{title}</p>
                        <p className="mt-1 text-sm leading-6 text-secondary">
                          {description}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 rounded-[var(--radius-standard)] bg-surface-secondary px-4 py-3 text-sm leading-6 text-secondary">
                  The product direction is a consistent first response followed
                  by a clear handoff to the business.
                </p>
              </div>
            </aside>
          </Container>
        </section>

        <section
          id="problem"
          className="scroll-mt-8 bg-surface-primary py-16 sm:py-20 lg:py-24"
          aria-labelledby="problem-heading"
        >
          <Container>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand">
                The everyday problem
              </p>
              <h2
                id="problem-heading"
                className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-primary sm:text-4xl"
              >
                Good service work does not always leave time to answer.
              </h2>
              <p className="mt-4 text-lg leading-8 text-secondary">
                Small teams often have to choose between helping the customer
                in front of them and responding immediately to the next one.
              </p>
            </div>
            <ul className="mt-10 grid gap-5 md:grid-cols-3">
              {problems.map((problem) => (
                <li
                  key={problem.number}
                  className="rounded-[var(--radius-large)] border border-border bg-page p-6 shadow-[var(--shadow-subtle)] sm:p-7"
                >
                  <span className="text-sm font-bold text-brand">
                    {problem.number}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-primary">
                    {problem.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-secondary">
                    {problem.description}
                  </p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section
          id="workflow"
          className="scroll-mt-8 border-y border-border bg-page py-16 sm:py-20 lg:py-24"
          aria-labelledby="workflow-heading"
        >
          <Container>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-brand">
                  Intended workflow
                </p>
                <h2
                  id="workflow-heading"
                  className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-primary sm:text-4xl"
                >
                  From a new inquiry to a useful handoff.
                </h2>
                <p className="mt-4 text-lg leading-8 text-secondary">
                  The planned experience keeps the process focused on the
                  information a service business needs to follow up well.
                </p>
              </div>
              <p className="max-w-md rounded-[var(--radius-standard)] border border-border bg-brand-surface px-4 py-3 text-sm leading-6 text-brand">
                This is the intended product direction. Live communication and
                AI infrastructure are not represented as complete today.
              </p>
            </div>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {workflow.map((step) => (
                <li
                  key={step.number}
                  className="rounded-[var(--radius-large)] border border-border bg-surface-primary p-6 shadow-[var(--shadow-subtle)] sm:p-7"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-brand text-sm font-bold text-white">
                    {step.number}
                  </span>
                  <h3 className="mt-6 text-lg font-semibold text-primary">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-secondary">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section
          id="product"
          className="scroll-mt-8 bg-surface-primary py-16 sm:py-20 lg:py-24"
          aria-labelledby="preview-heading"
        >
          <Container className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(28rem,1.2fr)] lg:gap-16">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-brand">
                Illustrative product preview
              </p>
              <h2
                id="preview-heading"
                className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-primary sm:text-4xl"
              >
                See the request without searching for the details.
              </h2>
              <p className="mt-4 text-lg leading-8 text-secondary">
                The intended summary brings the customer’s request, contact
                preference, timing, and next status into one readable view.
              </p>
              <p className="mt-5 text-sm leading-6 text-muted">
                Jordan Lee and the inquiry below are fictional. This static
                preview demonstrates product direction only.
              </p>
            </div>

            <div
              className="overflow-hidden rounded-[var(--radius-large)] border border-border bg-surface-primary shadow-[var(--shadow-stronger)]"
              role="group"
              aria-label="Illustrative customer inquiry"
            >
              <div className="flex flex-col gap-3 border-b border-border bg-surface-secondary px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    Illustrative preview
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-primary">
                    New customer inquiry
                  </h3>
                </div>
                <span className="w-fit rounded-full bg-brand-surface px-3 py-1.5 text-xs font-semibold text-brand">
                  Needs review
                </span>
              </div>
              <dl className="grid sm:grid-cols-2">
                {inquiryDetails.map(([term, detail], index) => (
                  <div
                    key={term}
                    className={`border-border px-5 py-4 sm:px-6 ${
                      index < 3 ? "border-b" : ""
                    } ${index >= 2 ? "sm:border-b-0" : ""} ${
                      index % 2 === 0 ? "sm:border-r" : ""
                    }`}
                  >
                    <dt className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                      {term}
                    </dt>
                    <dd className="mt-1.5 text-sm font-semibold text-primary">
                      {detail}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-border px-5 py-5 sm:px-6">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
                  Inquiry summary
                </p>
                <p className="mt-2 text-sm leading-6 text-secondary">
                  Customer is planning a local move next month and would like
                  an estimate for a two-bedroom home.
                </p>
              </div>
            </div>
          </Container>
        </section>

        <section
          id="trust"
          className="scroll-mt-8 border-y border-border bg-page py-16 sm:py-20 lg:py-24"
          aria-labelledby="trust-heading"
        >
          <Container>
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-brand">
                A trustworthy approach
              </p>
              <h2
                id="trust-heading"
                className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-primary sm:text-4xl"
              >
                Technology should support good service, not replace judgment.
              </h2>
              <p className="mt-4 text-lg leading-8 text-secondary">
                The platform is intended to help owners and staff stay
                organized while people remain in control of customer decisions
                and follow-up.
              </p>
            </div>
            <ul className="mt-10 grid gap-5 md:grid-cols-2">
              {trustPrinciples.map((principle) => (
                <li
                  key={principle.title}
                  className="flex gap-4 rounded-[var(--radius-large)] border border-border bg-surface-primary p-6 shadow-[var(--shadow-subtle)] sm:p-7"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-brand-surface text-sm font-bold text-brand"
                  >
                    ✓
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-primary">
                      {principle.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-secondary">
                      {principle.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section
          id="early-access"
          className="scroll-mt-8 bg-surface-primary py-16 sm:py-20 lg:py-24"
          aria-labelledby="early-access-heading"
        >
          <Container>
            <div className="overflow-hidden rounded-[var(--radius-large)] bg-primary px-6 py-10 shadow-[var(--shadow-stronger)] sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:px-14">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-white/75">
                  Early access for service businesses
                </p>
                <h2
                  id="early-access-heading"
                  className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl"
                >
                  Does your team struggle to keep up with every new inquiry?
                </h2>
                <p className="mt-4 text-base leading-7 text-white/80">
                  We want to learn from owners and managers who handle regular
                  service inquiries and care about a dependable customer
                  experience. The product is under active development, and
                  early conversations will help shape what is built.
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
