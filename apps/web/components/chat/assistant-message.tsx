import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

type AssistantMessageProps = {
  content: string;
  meta?: string;
};

export function AssistantMessage({ content, meta }: AssistantMessageProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.9, 0.2, 1] }}
      className="min-w-0 max-w-3xl w-full space-y-3"
    >
      {meta ? (
        <p className="inline-flex items-center gap-1 text-sm text-[#7a7467]">
          {meta}
          <ChevronRight className="h-3.5 w-3.5" />
        </p>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-[16px] leading-8 text-[#2b2b2b]">
        {content}
      </p>
    </motion.article>
  );
}
