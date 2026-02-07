import { defineCollection, z } from 'astro:content';

const knowledgeCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    readTime: z.string(),
    pubDate: z.date(),
    updatedDate: z.date().optional(),
  }),
});

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    author: z.string(),
    authImage: z.string(),
    image: z.string(),
    tags: z.array(z.string()),
    summary: z.string(),
    type: z.enum(['Article', 'Tutorial']),
  }),
});

export const collections = {
  knowledge: knowledgeCollection,
  blog: blogCollection,
};