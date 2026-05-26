"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type NavItemProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
};

export function NavItem({ icon: Icon, label, active, disabled }: NavItemProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        active
          ? "bg-[#ebe8de] text-[#2b2b2b]"
          : "text-[#5f5e5a] hover:bg-[#efede5] hover:text-[#2f2f2d]",
        disabled && "cursor-not-allowed opacity-60",
      )}
      type="button"
      disabled={disabled}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </motion.button>
  );
}
