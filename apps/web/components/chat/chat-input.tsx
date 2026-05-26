"use client";

import { Pause, Plus, SendHorizontal } from "lucide-react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPause: () => void;
  streaming: boolean;
  showLoader?: boolean;
};

export function ChatInput({ value, onChange, onSubmit, onPause, streaming, showLoader }: ChatInputProps) {
  return (
    <div className="w-full min-w-0 px-4 pb-3 shadow-sm">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mx-auto w-full min-w-0"
      >
        <div className="rounded-[24px] border border-[#ddd8cb] bg-[#ffffff] p-3 shadow-sm flex flex-col min-w-0 w-full">
          <Textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (streaming) {
                  onPause();
                } else {
                  onSubmit();
                }
              }
            }}
            rows={1}
            placeholder="Write a message..."
            style={{ fieldSizing: "content" }}
            className="max-h-55 min-h-7.5 overflow-y-auto resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-7 text-[#2d2c29] shadow-none focus-visible:ring-0 w-full min-w-0"
          />

          <div className="mt-2 flex items-center justify-between px-1 min-w-0 w-full">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 rounded-full text-[#6b675f] hover:bg-[#ede9de]"
            >
              <Plus className="h-4 w-4" />
            </Button>

            <div className="flex shrink-0 items-center gap-2">
              {showLoader ? (
                <div className="flex items-center justify-center mr-1">
                  <svg className="animate-spin h-4 w-4 text-[#2f2f2d]" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                </div>
              ) : null}

              <Button
                size="icon"
                onClick={streaming ? onPause : onSubmit}
                disabled={!streaming && !value.trim()}
                className="h-8 w-8 rounded-full bg-[#2f2f2d] text-[#f5f3ee] hover:bg-[#252523]"
              >
                {streaming ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
