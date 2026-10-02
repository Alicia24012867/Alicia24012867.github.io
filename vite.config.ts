import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { blogFeed } from './src/config/feeds.mjs';
import { articlesPlugin } from './scripts/content/plugin.mjs';
import { notFoundPlugin } from './scripts/not-found.mjs';
import { sitemapPlugin } from './scripts/content/sitemap.mjs';
import { sharePlugin } from './scripts/content/share.mjs';

const blog = articlesPlugin({ feed: blogFeed });
const notes = articlesPlugin({
  directory: 'content/notes',
  moduleId: 'virtual:notes',
  basePath: '/notes/',
});

// This repository is deployed as a GitHub User Page at the domain root.
export default defineConfig({
  plugins: [
    react(),
    notFoundPlugin(),
    blog,
    notes,
    sharePlugin([blog.api, notes.api], { siteUrl: blogFeed.siteUrl }),
    sitemapPlugin([blog.api, notes.api], blogFeed.siteUrl),
  ],
  base: '/',
  appType: 'mpa',
  build: {
    manifest: true,
    rolldownOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        blog: resolve(import.meta.dirname, 'blog/index.html'),
        notes: resolve(import.meta.dirname, 'notes/index.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
});
