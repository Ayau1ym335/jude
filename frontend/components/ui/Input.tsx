import { cn } from "@/lib/cn";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="flex flex-col gap-1.5" htmlFor={inputId}>
      {label ? (
        <span className="text-sm font-medium text-jude-ink">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={cn(
          "h-10 rounded-lg border border-jude-border-strong bg-jude-surface px-3 text-sm text-jude-ink shadow-jude-sm outline-none transition-colors placeholder:text-jude-subtle focus:border-jude-accent focus:ring-2 focus:ring-jude-accent/20",
          error && "border-jude-error focus:border-jude-error focus:ring-jude-error/20",
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-jude-error">{error}</span> : null}
    </label>
  );
}
