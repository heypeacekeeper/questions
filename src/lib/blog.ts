import { getCollection, type CollectionEntry } from 'astro:content';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');

  return posts
    .filter((post: BlogPost) => !post.data.draft)
    .sort(
      (first: BlogPost, second: BlogPost) =>
        second.data.publishedAt.getTime() - first.data.publishedAt.getTime(),
    );
}

export function blogPostPath(post: Pick<BlogPost, 'id'>): string {
  return `/blog/${post.id}/`;
}

export function formatBlogDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function blogCategoryLabel(category: string): string {
  return category
    .split('-')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}
