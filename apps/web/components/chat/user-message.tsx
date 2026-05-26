import { motion } from "framer-motion";

export function UserMessage({ content }: { content: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.2, 0.9, 0.2, 1] }}
      className="flex justify-end w-full min-w-0"
    >
      <div className="max-w-[85%] sm:max-w-xl rounded-2xl bg-[#f2f0ea] px-5 py-4 whitespace-pre-wrap break-words text-[16px] leading-8 text-[#2e2d2a]">
        {content}
      </div>
    </motion.div>
  );
}
