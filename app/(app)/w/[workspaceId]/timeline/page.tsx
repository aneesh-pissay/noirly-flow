import { PageContainer } from "@noirly-dev/ui";
import { TimelineView } from "@/src/features/timeline/TimelineView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Timeline" };

export default async function WorkspaceTimelinePage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <TimelineView workspaceId={workspaceId} />
    </PageContainer>
  );
}
