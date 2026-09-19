import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { articlesPlugin } from './scripts/articles-plugin.mjs';

// Relative assets work both at / and /Alicia24012867/ on GitHub Pages.
export default defineConfig({
  plugins: [react(), articlesPlugin()],
  base: './',
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
