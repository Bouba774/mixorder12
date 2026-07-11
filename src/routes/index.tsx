import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace-context";
import { WelcomeScreen } from "@/components/mixorder/WelcomeScreen";
import { Workspace } from "@/components/mixorder/Workspace";

export const Route = createFileRoute("/")({
  component: Index,
});

function AppShell() {
  const { project } = useWorkspace();
  return project ? <Workspace /> : <WelcomeScreen />;
}

function Index() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  );
}
