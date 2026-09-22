import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({
    base: './src/content/blog',
    pattern: '**/*.md',
  }),
  schema: z.object({
    title: z.string().min(10).max(70),
    description: z.string().min(50).max(170),
    excerpt: z.string().min(40).max(240),
    author: z.string().min(2).max(80).default('Would You Rather Questions Editorial Team'),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    category: z.string().min(2).max(50),
    tags: z.array(z.string().min(2).max(40)).max(10).default([]),
    readingMinutes: z.number().int().min(1).max(60),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    image: z.string().startsWith('/').optional(),
    imageAlt: z.string().min(5).max(150).optional(),
  }),
});

export const collections = { blog };
