import * as React from "react";
import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-100",
        className,
      )}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("leading-none", className)} {...props} />;
}

export { Avatar, AvatarFallback };
