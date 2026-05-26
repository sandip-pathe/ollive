"use client";

import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type RecentChatItemProps = {
  title: string;
  active?: boolean;
  onClick?: () => void;
};

export function RecentChatItem({ title, active, onClick }: RecentChatItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-[#e8e5dc] text-[#2d2d2b]"
          : "text-[#5f5d59] hover:bg-[#efede5] hover:text-[#2e2e2c]",
      )}
    >
      <span className="truncate">{title}</span>
      <MoreVertical className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
