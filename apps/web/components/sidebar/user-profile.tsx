"use client";

import { ChevronsUpDown, Download } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function UserProfile() {
  return (
    <div className="rounded-2xl border border-[#e3dfd2] bg-[#f8f6ee] p-2">
      <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
        <Avatar className="h-8 w-8 bg-[#2f2f2d] text-[#f3f1ea]">
          <AvatarFallback>S</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#2f2f2d]">Sandip</p>
          <p className="text-xs text-[#7b776e]">Free plan</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6c6860]">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-[#6c6860]">
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
