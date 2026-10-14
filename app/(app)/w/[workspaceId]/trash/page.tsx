import { TrashView } from "@/src/features/task/TrashView";

type Params = { params: Promise<{ workspaceId: string }> };

export default async function WorkspaceTrashPage({ params }: Params) {
  const { workspaceId } = await params;
  return <TrashView workspaceId={workspaceId} />;
}
