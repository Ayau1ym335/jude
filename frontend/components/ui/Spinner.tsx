import { cn } from "@/lib/cn";

interface SpinnerProps {
  className?: string;
  label?: string;
}

export default function Spinner({ className, label = "Загрузка..." }: SpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-jude-border border-t-jude-accent" />
      {label ? <p className="text-sm text-jude-muted">{label}</p> : null}
    </div>
  );
}
