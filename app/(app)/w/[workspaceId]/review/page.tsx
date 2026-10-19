import { PageContainer } from "@noirly-dev/ui";
import { ReviewView } from "@/src/features/review/ReviewView";

type Params = { params: Promise<{ workspaceId: string }> };

export const metadata = { title: "Review" };

export default async function WorkspaceReviewPage({ params }: Params) {
  const { workspaceId } = await params;
  return (
    <PageContainer size="lg">
      <ReviewView workspaceId={workspaceId} />
    </PageContainer>
  );
}
