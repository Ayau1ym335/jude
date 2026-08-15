import { cn } from "@/lib/cn";

type AlertVariant = "error" | "warning" | "success" | "info";

const variantClasses: Record<AlertVariant, string> = {
  error: "border-jude-error/20 bg-jude-error-soft text-jude-error",
  warning: "border-jude-warning/20 bg-jude-warning-soft text-jude-warning",
  success: "border-jude-success/20 bg-jude-success-soft text-jude-success",
  info: "border-jude-border-strong bg-jude-surface-muted text-jude-muted",
};

interface AlertProps {
  children: React.ReactNode;
  variant?: AlertVariant;
  className?: string;
}

export default function Alert({
  children,
  variant = "info",
  className,
}: AlertProps) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
