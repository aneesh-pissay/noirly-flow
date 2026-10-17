import { PageContainer } from "@noirly-dev/ui";
import { AgendaView } from "@/src/features/task/AgendaView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Today" };

export default async function WorkspaceTodayPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <AgendaView workspaceId={workspaceId} mode="today" />
    </PageContainer>
  );
}
