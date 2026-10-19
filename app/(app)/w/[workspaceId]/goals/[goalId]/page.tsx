import { PageContainer } from "@noirly-dev/ui";
import { GoalDetail } from "@/src/features/goals/GoalDetail";

type Params = { params: Promise<{ workspaceId: string; goalId: string }> };

export const metadata = { title: "Goal" };

export default async function WorkspaceGoalPage({ params }: Params) {
  const { workspaceId, goalId } = await params;
  return (
    <PageContainer size="lg">
      <GoalDetail workspaceId={workspaceId} goalId={goalId} />
    </PageContainer>
  );
}
