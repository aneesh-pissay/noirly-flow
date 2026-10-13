import { PageContainer } from "@noirly-dev/ui";
import { ProjectChat } from "@/src/features/chat/ProjectChat";

type Params = { params: Promise<{ workspaceId: string; projectId: string }> };

export default async function ProjectChatPage({ params }: Params) {
  const { workspaceId, projectId } = await params;
  return (
    <PageContainer size="lg" className="h-full min-h-0">
      <ProjectChat workspaceId={workspaceId} projectId={projectId} />
    </PageContainer>
  );
}
