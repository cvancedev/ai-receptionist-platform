import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { branding } from "@/config/branding";

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface-primary py-10 sm:py-12">
      <Container className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-semibold text-primary">{branding.productName}</p>
          <p className="mt-2 text-sm text-secondary">{branding.tagline}</p>
          <p className="mt-4 text-sm text-muted">
            © {currentYear} {branding.copyrightOwner}. All rights reserved.
          </p>
        </div>
        <div className="space-y-4 lg:text-right">
          <nav aria-label="Footer navigation">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm lg:justify-end">
              <li>
                <Link
                  href="/early-access"
                  className="rounded text-secondary underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                >
                  Early Access
                </Link>
              </li>
            <li>
              <Link
                href="/privacy"
                prefetch={false}
                className="rounded text-secondary underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                prefetch={false}
                className="rounded text-secondary underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
              >
                Terms
              </Link>
            </li>
            </ul>
          </nav>
          <address className="not-italic text-sm text-muted">
            Support:{" "}
            <a
              href={`mailto:${branding.supportEmail}`}
              className="rounded text-secondary underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              {branding.supportEmail}
            </a>
          </address>
        </div>
      </Container>
    </footer>
  );
}
