import { cn } from "@/lib/utils";

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

export { Badge };
