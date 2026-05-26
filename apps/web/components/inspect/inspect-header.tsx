"use client";

import { Badge } from "@/components/ui/badge";

export function InspectHeader({
  sessionId,
}: {
  sessionId: string;
  onClose?: () => void;
}) {
  return (
    <header className="flex w-full shrink-0 min-w-0 items-start justify-between gap-4 border-b border-[#ddd8cb] bg-[#f6f4ec] px-5 py-4">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[15px] font-semibold tracking-wide text-[#2f2d28] truncate">
            Inspect
          </h2>
          <Badge className="shrink-0 border-[#d4cebf] bg-[#f1ecdf] text-[11px] text-[#676057]">
            Live trace
          </Badge>
        </div>
      </div>
    </header>
  );
}
