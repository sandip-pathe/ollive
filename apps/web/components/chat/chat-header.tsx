"use client";

import { ChevronDown, PanelLeft, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

type ChatHeaderProps = {
  title: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onToggleInspect: () => void;
  inspectOpen: boolean;
};

export function ChatHeader({
  title,
  sidebarOpen,
  onToggleSidebar,
  onToggleInspect,
  inspectOpen,
}: ChatHeaderProps) {
  return (
    <header className="shrink-0 sticky top-0 z-20 w-full min-w-0 bg-[#faf9f5]/90 px-4 py-2 backdrop-blur-sm">
      <div className="flex w-full min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-[#67625b] md:hidden"
            onClick={onToggleSidebar}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="hidden h-9 rounded-full border px-3 text-sm text-[#4a4741] md:inline-flex"
          >
            <PanelLeft className="mr-2 h-4 w-4" />
            {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-[#67625b] md:hidden"
            onClick={onToggleInspect}
            aria-label={inspectOpen ? "Close inspect" : "Open inspect"}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleInspect}
            className={[
              "hidden h-9 rounded-full border px-3 text-sm md:inline-flex",
              inspectOpen
                ? "border-[#c8c2b5] bg-[#efece4] text-[#2d2c28]"
                : "border-[#dfdbd0] bg-[#f7f5ee] text-[#4a4741] hover:bg-[#ece8de]",
            ].join(" ")}
          >
            <PanelRightOpen className="mr-2 h-4 w-4" />
            {inspectOpen ? "Close inspect" : "Inspect"}
          </Button>
        </div>
      </div>
    </header>
  );
}
