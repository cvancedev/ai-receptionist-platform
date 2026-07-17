import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonBaseProps {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
}

type LinkButtonProps = ButtonBaseProps &
  Omit<ComponentProps<typeof Link>, "children" | "className" | "href"> & {
    href: string;
  };

type NativeButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> & {
    href?: never;
  };

export type ButtonProps = LinkButtonProps | NativeButtonProps;

const baseClasses =
  "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-standard)] px-5 py-2.5 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-y-px";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-brand bg-brand text-white shadow-sm hover:border-brand-hover hover:bg-brand-hover",
  secondary:
    "border border-border bg-surface-primary text-primary shadow-sm hover:border-brand hover:bg-brand-surface",
  ghost:
    "border border-transparent bg-transparent text-secondary hover:bg-surface-secondary hover:text-primary",
};

export function Button(props: ButtonProps) {
  if (typeof props.href === "string") {
    const {
      href,
      className = "",
      variant = "primary",
      children,
      ...linkProps
    } = props;
    const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

    return (
      <Link href={href} className={classes} {...linkProps}>
        {children}
      </Link>
    );
  }

  const {
    className = "",
    variant = "primary",
    children,
    type = "button",
    disabled,
    ...buttonProps
  } = props;
  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${classes} disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0`}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
