import { execFileSync } from 'node:child_process';

/**
 * The first of `files` that exists at a Git revision, as it was there. Files are named from
 * web/; revisions from before the site's code moved into web/ hold it at the repository's root.
 */
export function showAtRevision(ref, ...files) {
  const names = new Set(
    execFileSync('git', ['ls-tree', '-r', '--full-tree', '--name-only', ref], {
      encoding: 'utf8',
    }).split('\n'),
  );
  for (const file of files)
    for (const name of [`web/${file}`, file])
      if (names.has(name))
        return execFileSync('git', ['show', `${ref}:${name}`], { encoding: 'utf8' });
  throw new Error(`${ref} has none of ${files.join(', ')}`);
}
