import { PageContainer } from "@noirly-dev/ui";
import { FilterView } from "@/src/features/filters/FilterView";

type Params = { params: Promise<{ workspaceId: string; filterId: string }> };

export const metadata = { title: "Filter" };

export default async function WorkspaceFilterPage({ params }: Params) {
  const { workspaceId, filterId } = await params;
  return (
    <PageContainer size="lg">
      <FilterView workspaceId={workspaceId} filterId={filterId} />
    </PageContainer>
  );
}
