import Link from "next/link";
import { branding } from "@/config/branding";

interface LogoProps {
  className?: string;
}

export function Logo({ className = "" }: LogoProps) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-2.5 rounded-md text-base font-semibold tracking-[-0.02em] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${className}`}
      aria-label={`${branding.logoText} home`}
    >
      <span
        aria-hidden="true"
        className="size-3 rounded-sm bg-brand shadow-sm"
      />
      <span>{branding.logoText}</span>
    </Link>
  );
}
