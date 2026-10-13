import type { CommentMention } from "@/src/core/sync/types";

/** Keep tags anchored to the exact text selected by the author; editing a tag removes it. */
export function moveMentions(previous: string, next: string, mentions: CommentMention[]): CommentMention[] {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let end = previous.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
  const delta = nextEnd - end;
  return mentions.flatMap((mention) => {
    if (mention.end <= start) return [mention];
    if (mention.start >= end) return [{ ...mention, start: mention.start + delta, end: mention.end + delta }];
    return [];
  });
}
