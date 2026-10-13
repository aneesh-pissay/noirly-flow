import { WorkspaceSettingsView } from "@/src/features/workspace/WorkspaceSettingsView";

type Params = { params: Promise<{ workspaceId: string }> };

export default async function WorkspaceSettingsPage({ params }: Params) {
  const { workspaceId } = await params;
  return <WorkspaceSettingsView workspaceId={workspaceId} />;
}
