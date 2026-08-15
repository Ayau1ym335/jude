import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-jude-primary text-white shadow-jude hover:bg-jude-primary-hover disabled:bg-jude-primary/50",
  accent:
    "bg-jude-accent text-white shadow-jude hover:bg-jude-accent-hover disabled:bg-jude-accent/50",
  secondary:
    "border border-jude-border-strong bg-jude-surface text-jude-ink shadow-jude-sm hover:bg-jude-surface-muted",
  ghost: "text-jude-muted hover:bg-jude-primary-soft hover:text-jude-ink",
  destructive:
    "bg-jude-error text-white hover:bg-jude-accent-hover disabled:bg-jude-error/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-lg",
  lg: "h-11 px-5 text-sm rounded-xl",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export default function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jude-accent/40 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
