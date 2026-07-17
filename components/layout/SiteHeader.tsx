import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";

const navigation = [
  { href: "/#workflow", label: "How It Works" },
  { href: "/early-access", label: "Early Access" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-border/80 bg-surface-primary/95">
      <Container className="flex min-h-18 items-center justify-between gap-4 py-3">
        <Logo />
        <div className="flex items-center gap-3 sm:gap-5">
          <nav aria-label="Primary navigation" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center rounded-lg px-3.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Button href="/early-access" className="px-4 sm:px-5">
            Request Early Access
          </Button>
        </div>
      </Container>
    </header>
  );
}
