import { motion } from "framer-motion";
import { MarkdownMessage } from "./markdown-message";

export function UserMessage({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.2, 0.9, 0.2, 1] }}
      className="flex justify-end w-full min-w-0"
    >
      <div className="max-w-[85%] sm:max-w-xl rounded-2xl bg-[#f2f0ea] px-5 py-4">
        <MarkdownMessage content={content} tone="user" />
      </div>
    </motion.div>
  );
}
