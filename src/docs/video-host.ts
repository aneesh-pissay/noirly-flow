/**
 * The Docs tutorial MP4s aren't in the repo: they're in Cloudflare R2, served
 * from the bucket's public r2.dev URL as `doc-videos/<article-id>.mp4`.
 * Without R2_ACCOUNT_ID (tests, local setups with no R2), videos are off and
 * articles say a walkthrough is coming.
 */
export function docsVideoBaseUrl(accountId = process.env.R2_ACCOUNT_ID): string {
  const account = accountId?.trim();
  return account ? `https://pub-${account}.r2.dev/doc-videos` : "";
}
