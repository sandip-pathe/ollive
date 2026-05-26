"use client";

import { useEffect, useState } from "react";
import { Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/app/lib/api";
import { clearStoredAuthSession, getStoredAuthSession, setStoredAuthSession } from "@/app/lib/auth";

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const session = getStoredAuthSession();
    if (!session) {
      setAuthState("unauthenticated");
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!response.ok) throw new Error("Session expired");
        const user = (await response.json()) as { display_name?: string | null };
        setStoredAuthSession({
          token: session.token,
          displayName: user.display_name || session.displayName || "Guest",
        });
        setAuthState("authenticated");
      } catch {
        clearStoredAuthSession();
        setAuthState("unauthenticated");
      }
    })();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: inviteCode,
          display_name: displayName || undefined,
        }),
      });
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        throw new Error(message || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        token: string;
        user: { display_name?: string | null };
      };
      setStoredAuthSession({
        token: data.token,
        displayName: data.user.display_name || displayName || "Guest",
      });
      setAuthState("authenticated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (authState === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-[linear-gradient(180deg,#fbfaf6_0%,#f4f1e8_100%)] px-4">
        <Card className="w-full max-w-md border-[#e3dfd2] bg-white/90 shadow-lg backdrop-blur">
          <CardContent className="p-6 text-center text-sm text-[#6b665e]">
            Checking your session...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <div className="flex h-screen items-center justify-center bg-[linear-gradient(180deg,#fbfaf6_0%,#f4f1e8_100%)] px-4">
        <Card className="w-full max-w-md border-[#e3dfd2] bg-white/90 shadow-lg backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-2 text-[#6d6a62]">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-[0.18em]">Private workspace</span>
            </div>
            <CardTitle className="text-2xl text-[#201f1d]">Sign in to Ollive</CardTitle>
            <CardDescription className="text-[#6b665e]">
              Enter your invite code to open your own chat workspace. Each login gets its own conversations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="Invite code"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Display name (optional)"
                  autoComplete="name"
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                <Shield className="mr-2 h-4 w-4" />
                {loading ? "Signing in..." : "Enter workspace"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
