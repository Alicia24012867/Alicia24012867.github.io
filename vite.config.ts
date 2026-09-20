import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { articlesPlugin } from './scripts/content/plugin.mjs';

// This repository is deployed as a GitHub User Page at the domain root.
export default defineConfig({
  plugins: [
    react(),
    articlesPlugin(),
    articlesPlugin({ directory: 'content/notes', moduleId: 'virtual:notes', basePath: '/notes/' }),
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
      },
    },
  },
});
