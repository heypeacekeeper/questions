export interface BlogPublicationData {
  draft: boolean;
  publishedAt: Date;
}

export function isBlogPostPublished(post: BlogPublicationData, now: Date = new Date()): boolean {
  return !post.draft && post.publishedAt.getTime() <= now.getTime();
}
