import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Container } from "@/components/ui/Container";

interface ContentPageProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly children: ReactNode;
}

export function ContentPage({
  eyebrow,
  title,
  introduction,
  children,
}: ContentPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-border bg-surface-primary py-14 sm:py-18 lg:py-22">
          <Container>
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-brand">{eyebrow}</p>
              <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.04em] text-primary sm:text-5xl">
                {title}
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-lg leading-8 text-secondary">
                {introduction}
              </p>
            </div>
          </Container>
        </section>
        <Container className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl space-y-10 sm:space-y-12">{children}</div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
