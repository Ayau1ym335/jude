import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "error" | "muted";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-jude-primary-soft text-jude-primary",
  accent: "bg-jude-accent-soft text-jude-accent",
  success: "bg-jude-success-soft text-jude-success",
  warning: "bg-jude-warning-soft text-jude-warning",
  error: "bg-jude-error-soft text-jude-error",
  muted: "bg-jude-bg text-jude-muted",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export default function Badge({
  children,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
