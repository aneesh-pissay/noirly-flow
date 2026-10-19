import { PageContainer } from "@noirly-dev/ui";
import { HabitsView } from "@/src/features/habits/HabitsView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Habits" };

export default async function WorkspaceHabitsPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <HabitsView workspaceId={workspaceId} />
    </PageContainer>
  );
}
