"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EvidencePacketResponse, MetricsOverview, Trace as ApiTrace } from "@/app/lib/api";
import { EvidencePacketPanel } from "./evidence-packet";
import { OpsReview } from "./ops-review";
import { RequestCard } from "./request-card";

type InspectTabsProps = {
  traces: ApiTrace[];
  selectedTrace: ApiTrace | null;
  metrics: MetricsOverview | null;
  evidencePacket: EvidencePacketResponse | null;
  onRecomputePacket?: () => void;
  recomputingPacket?: boolean;
  summary: Array<{ label: string; value: string; hint: string }>;
  sections: {
    events: string[];
    tokens: string[];
    memory: string[];
    network: string[];
    logs: string[];
    metadata: string[];
    wrapper: string[];
  };
};

export function InspectTabs({
  traces,
  selectedTrace,
  metrics,
  evidencePacket,
  onRecomputePacket,
  recomputingPacket,
  summary,
  sections,
}: InspectTabsProps) {
  return (
    <ScrollArea className="flex-1 min-h-0 w-full overflow-hidden">
      <div className="mx-auto flex w-full max-w-none flex-col gap-4 px-3 py-3 sm:px-4 lg:px-5 lg:py-4">
        <EvidencePacketPanel
          packet={evidencePacket}
          selectedTrace={selectedTrace}
          onRecompute={onRecomputePacket}
          recomputing={recomputingPacket}
        />

        <OpsReview metrics={metrics} traces={traces} />

        <section className="rounded-[28px] border border-[#ddd6c6] bg-[#f6f3ea] px-4 py-4 shadow-[0_8px_24px_rgba(55,46,28,0.04)] sm:px-5">
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            {summary.map((item) => (
              <div
                key={item.label}
                className="min-w-0 rounded-2xl border border-[#ddd6c6] bg-[#fbf8ef] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#8c8478]">
                    {item.label}
                  </p>
                  <Badge className="shrink-0 border-[#dad1bf] bg-[#efe8db] text-[#5e574c]">
                    Live
                  </Badge>
                </div>
                <p className="mt-2 break-words text-xl font-semibold text-[#2f2d28]">
                  {item.value}
                </p>
                <p className="mt-1 whitespace-normal text-xs leading-5 text-[#6f685e]">
                  {item.hint}
                </p>
              </div>
            ))}
          </div>
        </section>

        {selectedTrace ? (
          <section className="grid gap-4 md:grid-cols-1">
            <div className="rounded-[28px] border border-[#ddd6c6] bg-[#fbf9f3] shadow-[0_8px_24px_rgba(55,46,28,0.05)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1dacb] px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[#8c8478]">
                    Selected request
                  </p>
                </div>
                <Badge className="border-[#d5cfbf] bg-[#f0eada] text-[#5f574b]">
                  {selectedTrace.provider} / {selectedTrace.model}
                </Badge>
              </div>
              <div className="p-3 sm:p-4">
                <RequestCard trace={selectedTrace} />
              </div>
            </div>

            <CompactPanel
              title="Token usage"
              items={sections.tokens}
              defaultOpen
            />
            <CompactPanel
              title="Extraction results"
              items={sections.metadata}
              defaultOpen
            />

            <CompactPanel
              title="Network / outcome"
              items={sections.network}
              defaultOpen={false}
            />
            <CompactPanel
              title="Conversation state"
              items={sections.memory}
              defaultOpen={false}
            />
            <CompactPanel
              title="Raw payloads"
              items={sections.logs}
              defaultOpen={false}
            />
            <CompactPanel
              title="Wrapper payload"
              items={sections.wrapper}
              defaultOpen={false}
            />
            <CompactPanel
              title="Trace events"
              items={sections.events}
              defaultOpen={false}
            />
          </section>
        ) : (
          <section className="rounded-[28px] border border-dashed border-[#d5cfbf] bg-[#f9f6ee] px-4 py-8 text-sm text-[#6f685e]">
            No trace selected yet. Send a message and the latest request will
            appear here.
          </section>
        )}
      </div>
    </ScrollArea>
  );
}

function CompactPanel({
  title,
  items,
  defaultOpen = false,
}: {
  title: string;
  items: string[];
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-[24px] border border-[#ddd6c6] bg-[#f8f5ed] shadow-[0_8px_24px_rgba(55,46,28,0.04)]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-[0.18em] text-[#8c8478]">
            {title}
          </p>
          <p className="mt-1 text-xs text-[#6f685e]">
            Compact evidence surface.
          </p>
        </div>
        <span className="text-xs text-[#7d7467] group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-[#e1dacb] px-4 py-4 sm:px-5">
        <div className="space-y-2">
          {items.map((item, index) => (
            <div
              key={`${title}-${index}`}
              className="rounded-2xl border border-[#ddd6c6] bg-[#fbfaf6] px-3 py-2 text-sm leading-6 text-[#3e3931] break-words whitespace-pre-wrap"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
