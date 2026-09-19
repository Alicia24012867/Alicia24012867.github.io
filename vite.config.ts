import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { articlesPlugin } from './scripts/articles-plugin.mjs';

// This repository is deployed as a GitHub User Page at the domain root.
export default defineConfig({
  plugins: [react(), articlesPlugin()],
  base: '/',
  appType: 'mpa',
  build: {
    rolldownOptions: {
      input: {
        home: resolve(import.meta.dirname, 'index.html'),
        blog: resolve(import.meta.dirname, 'blog/index.html'),
      },
    },
  },
});
