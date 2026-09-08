import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary: "bg-signal-500 text-ink-950 hover:bg-signal-600 font-medium",
  secondary:
    "bg-ink-800 text-ink-100 border border-ink-700 hover:border-ink-600",
  ghost: "text-ink-200 hover:text-ink-50 hover:bg-ink-800",
};

const sizeStyles: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5 gap-1.5",
  md: "text-sm px-4 py-2 gap-2",
  lg: "text-base px-5 py-2.5 gap-2",
};

/**
 * Base button primitive. Extend variantStyles/sizeStyles rather than
 * overriding with ad-hoc className calls at usage sites.
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md
        transition-colors duration-150 ease-out
        disabled:opacity-40 disabled:pointer-events-none
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
