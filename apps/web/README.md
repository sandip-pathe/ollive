# Ollive Web

This is the Next.js frontend for Ollive.

## Responsibilities

- Chat UI and conversation list.
- Local auth gate with optional development bypass.
- Markdown rendering for user and assistant messages.
- Inspect panel for metrics, traces, raw request/response details, runtime events, and evidence packets.
- Agent Risk & Insurability Evidence Packet UI.

## Local Development

From the repository root, the simplest path is Docker Compose:

```bash
docker compose up -d --build web api postgres redis worker
```

Then open [http://localhost:3000](http://localhost:3000).

For frontend-only development:

```bash
cd apps/web
npm install
npm run dev
```

The frontend expects:

- `NEXT_PUBLIC_API_BASE` - API base URL, usually `http://localhost:8001`.
- `NEXT_PUBLIC_AUTH_BYPASS` - set to `true` for local bypass only.

## Checks

```bash
npx tsc --noEmit --pretty false
```

```bash
npx eslint
```

Targeted checks for the inspect/chat surface:

```bash
npx eslint components/chat/markdown-message.tsx components/chat/assistant-message.tsx components/chat/user-message.tsx components/chat/chat-layout.tsx components/inspect/inspect-panel.tsx components/inspect/inspect-tabs.tsx components/inspect/evidence-packet.tsx components/inspect/ops-review.tsx components/auth/auth-gate.tsx app/lib/api.ts app/lib/auth.ts
```
