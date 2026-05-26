"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TraceEvent = {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  timestamp: string;
  latencyMs: number;
  tokens: string;
  cost: string;
  model: string;
  status: "success" | "warning" | "info";
  metadata: Array<{ label: string; value: string }>;
  details: string[];
};

const statusStyles: Record<TraceEvent["status"], string> = {
  success: "border-emerald-600/20 bg-emerald-600/10 text-emerald-800",
  warning: "border-amber-600/20 bg-amber-600/10 text-amber-800",
  info: "border-sky-600/20 bg-sky-600/10 text-sky-800",
};

export function TraceEventCard({
  event,
  defaultOpen = false,
  compact = false,
}: {
  event: TraceEvent;
  defaultOpen?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.article
      layout
      className={cn(
        "min-w-0 w-full rounded-2xl border border-[#ddd8cb] bg-[#f9f6ee] shadow-[0_8px_24px_rgba(55,46,28,0.08)]",
        compact && "shadow-[0_6px_18px_rgba(55,46,28,0.05)]",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full min-w-0 items-start gap-4 rounded-2xl text-left transition-colors hover:bg-[#f3efe2]",
          compact ? "px-3 py-3 sm:px-4" : "px-4 py-4",
        )}
      >
        <div className={cn("shrink-0 mt-0.5 rounded-full border border-[#d4cebf] bg-[#f1ecdf] text-[#7a7469]", compact ? "p-1.5" : "p-2")}>
          <ChevronRight
            className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", "transition-transform", open && "rotate-90")}
          />
        </div>

        <div className={cn("min-w-0 flex-1 space-y-2", compact && "space-y-1.5") }>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                "shrink-0 border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em]",
                statusStyles[event.status],
              )}
            >
              {event.kind}
            </Badge>
            <span className="text-sm text-[#8c8478] truncate">
              {event.timestamp}
            </span>
          </div>
          <div className="min-w-0 w-full">
            <p className={cn("font-medium text-[#2f2d28] truncate", compact ? "text-[14px]" : "text-[15px]") }>
              {event.title}
            </p>
            <p className={cn("mt-1 text-sm leading-6 text-[#6f685e] line-clamp-2", compact && "leading-5") }>
              {event.subtitle}
            </p>
          </div>
        </div>

        <div className={cn("grid shrink-0 gap-2 text-right text-xs text-[#6f685e]", compact && "gap-1") }>
          <span>{event.latencyMs} ms</span>
          <span>{event.tokens}</span>
          <span>{event.cost}</span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden min-w-0 w-full border-t border-[#ddd8cb]"
          >
            <div className={cn("space-y-4 min-w-0 w-full", compact ? "px-3 py-3 sm:px-4" : "px-4 py-4") }>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 min-w-0 w-full">
                {event.metadata.map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-xl border border-[#ddd8cb] bg-[#f9f6ee] px-3 py-2"
                  >
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#8c8478] truncate">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm text-[#2f2d28] truncate">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* CRITICAL: Overflows prevented here via break-all/break-words */}
              <div className={cn("space-y-2 rounded-xl border border-[#ddd8cb] bg-[#f9f6ee] overflow-hidden min-w-0 w-full", compact ? "px-3 py-2" : "px-3 py-3") }>
                {event.details.map((line) => (
                  <div
                    key={line}
                    className="flex items-start gap-2 text-sm text-[#4b443a] min-w-0 w-full"
                  >
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-[#867e72]" />
                    <span className="min-w-0">{line}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[#8c8478] min-w-0">
                <span className="truncate pr-4">{event.model}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8 rounded-full px-3 text-[#4b443a] hover:bg-[#efe9dc]"
                >
                  View raw event
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
}
