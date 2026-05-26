import { AuthGate } from "@/components/auth/auth-gate";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function Home() {
  return (
    <AuthGate>
      <WorkspaceShell />
    </AuthGate>
  );
}
