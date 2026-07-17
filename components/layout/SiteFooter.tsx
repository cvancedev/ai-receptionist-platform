import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { branding } from "@/config/branding";

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface-primary py-10 sm:py-12">
      <Container className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-primary">{branding.productName}</p>
          <p className="mt-2 text-sm text-secondary">{branding.tagline}</p>
          <p className="mt-4 text-sm text-muted">
            © {currentYear} {branding.copyrightOwner}. All rights reserved.
          </p>
        </div>
        <nav aria-label="Legal navigation">
          <ul className="flex items-center gap-5 text-sm">
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
      </Container>
    </footer>
  );
}
