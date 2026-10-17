import { PageContainer } from "@noirly-dev/ui";
import { FiltersIndex } from "@/src/features/filters/FiltersIndex";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Filters" };

export default async function WorkspaceFiltersPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <FiltersIndex workspaceId={workspaceId} />
    </PageContainer>
  );
}
