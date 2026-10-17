import { PageContainer } from "@noirly-dev/ui";
import { CapacityView } from "@/src/features/capacity/CapacityView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Capacity" };

export default async function WorkspaceCapacityPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <CapacityView workspaceId={workspaceId} />
    </PageContainer>
  );
}
