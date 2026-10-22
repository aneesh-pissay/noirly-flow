import { PageContainer } from "@noirly-dev/ui";
import { GoalsView } from "@/src/features/goals/GoalsView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Goals" };

export default async function WorkspaceGoalsPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <GoalsView workspaceId={workspaceId} />
    </PageContainer>
  );
}
