import { defineConfig } from 'astro/config';

import tailwind from "@astrojs/tailwind";

// Import the Vercel adapter
import vercel from '@astrojs/vercel';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: "https://positivustheme.vercel.app",
  integrations: [tailwind()],
  output: 'server',
  adapter: cloudflare(),
});