import type { ReactNode } from "react";
import { ARTICLES, articleHref, navTree } from "@/src/docs/registry";
import { buildSearchDocs } from "@/src/docs/search";
import { DocsLayout } from "@/src/features/docs/DocsLayout";

const nav = navTree();
const searchIndex = buildSearchDocs(ARTICLES, articleHref);

export default function DocsRootLayout({ children }: { children: ReactNode }) {
  return <DocsLayout nav={nav} searchIndex={searchIndex}>{children}</DocsLayout>;
}
