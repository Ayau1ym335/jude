import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  action,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-8 flex items-start justify-between gap-4",
        className,
      )}
    >
      <div>
        <h1 className="font-heading text-2xl text-jude-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-jude-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
