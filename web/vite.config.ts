import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { blogFeed } from './src/config/feeds.mjs';
import { mockApiPlugin } from './scripts/api/mock.mjs';
import { articlesPlugin } from './scripts/content/plugin.mjs';
import { contentRoot, repoRoot } from './scripts/content/paths.mjs';
import { privatePlugin } from './scripts/content/private.mjs';
import { notFoundPlugin } from './scripts/not-found.mjs';
import { musicPlugin } from './scripts/music.mjs';
import { sitemapPlugin } from './scripts/content/sitemap.mjs';
import { sharePlugin } from './scripts/content/share.mjs';

// Documents live beside web/, in the repository's content folder. Locked documents come from
// a private repository, checked out at content/locked, whose access.yml names their levels.
const blog = articlesPlugin({
  sourceRoot: repoRoot,
  directory: 'content/blog',
  feed: blogFeed,
  share: true,
  reader: 'src/blog/ArticleReader.tsx',
  lockedDirectory: 'content/locked/blog',
  lockedLevels: 'content/locked/access.yml',
});
const notes = articlesPlugin({
  sourceRoot: repoRoot,
  directory: 'content/notes',
  moduleId: 'virtual:notes',
  basePath: '/notes/',
  reader: 'src/notes/NoteReader.tsx',
  share: true,
  lockedDirectory: 'content/locked/notes',
  lockedLevels: 'content/locked/access.yml',
});
// Every page, and locked documents in plain form, for the blog API: written to dist-private/.
const privateDocuments = privatePlugin([blog.api, notes.api]);

// This repository is deployed as a GitHub User Page at the domain root.
export default defineConfig({
  plugins: [
    react(),
    notFoundPlugin(),
    blog,
    notes,
    sharePlugin([blog.api, notes.api], {
      siteUrl: blogFeed.siteUrl,
      lockedReader: 'src/content/locked/LockedArticle.tsx',
    }),
    sitemapPlugin([blog.api, notes.api], blogFeed.siteUrl),
    privateDocuments,
    // The dev server answers /api itself, or passes it to the backend that BLOG_API names.
    mockApiPlugin(privateDocuments.api),
    musicPlugin(),
  ],
  base: '/',
  appType: 'mpa',
  // Photos and attachments are served from the content folder, outside web/.
  server: { fs: { allow: [searchForWorkspaceRoot(import.meta.dirname), contentRoot] } },
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
