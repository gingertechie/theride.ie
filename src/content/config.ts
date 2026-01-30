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

export const collections = {
  knowledge: knowledgeCollection,
};