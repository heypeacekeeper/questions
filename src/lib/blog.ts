import { getCollection, type CollectionEntry } from 'astro:content';
import { isBlogPostPublished } from '@/lib/blog-publication';

export type BlogPost = CollectionEntry<'blog'>;

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  const posts = await getCollection('blog');
  const now = new Date();

  return posts
    .filter((post: BlogPost) => isBlogPostPublished(post.data, now))
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
