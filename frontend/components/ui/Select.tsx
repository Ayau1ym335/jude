import { cn } from "@/lib/cn";
import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export default function Select({ label, className, id, children, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <label className="flex flex-col gap-1.5" htmlFor={selectId}>
      {label ? (
        <span className="text-sm font-medium text-jude-ink">{label}</span>
      ) : null}
      <select
        id={selectId}
        className={cn(
          "h-10 rounded-lg border border-jude-border-strong bg-jude-surface px-3 text-sm text-jude-ink shadow-jude-sm outline-none transition-colors focus:border-jude-accent focus:ring-2 focus:ring-jude-accent/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
