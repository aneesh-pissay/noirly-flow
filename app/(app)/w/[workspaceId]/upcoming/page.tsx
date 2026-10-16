import { PageContainer } from "@noirly-dev/ui";
import { AgendaView } from "@/src/features/task/AgendaView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Upcoming" };

export default async function WorkspaceUpcomingPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <AgendaView workspaceId={workspaceId} mode="upcoming" />
    </PageContainer>
  );
}
