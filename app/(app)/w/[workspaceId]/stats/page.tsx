import { PageContainer } from "@noirly-dev/ui";
import { StatsView } from "@/src/features/stats/StatsView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Your stats" };

export default async function WorkspaceStatsPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <StatsView workspaceId={workspaceId} />
    </PageContainer>
  );
}
