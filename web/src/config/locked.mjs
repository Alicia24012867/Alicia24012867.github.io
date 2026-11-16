// Locked documents ship sealed: the build (scripts/content/locked.mjs) and the reader
// (src/content/locked) agree here on how sealed files are named and what a page says before
// its password opens it.

/** Built sealed files are named locked-<16 hex digits>.<extension>. */
export const lockedFilePrefix = 'locked-';

/**
 * Each level's key ring, which holds the keys of the levels below it, is in this folder, named
 * by the key that opens it. A ring changes when a lower level's password does, so it stays out
 * of the built files that never change under the same name.
 */
export const lockedRingDirectory = 'locked';

const kinds = { blog: 'post', notes: 'note' };

/**
 * An unlisted document's title is sealed too, so its page names only what it is.
 * @param {keyof typeof kinds} collection
 */
export const lockedTitle = (collection) => `A locked ${kinds[collection]}`;

/** @param {keyof typeof kinds} collection */
export const lockedDescription = (collection) =>
  `This ${kinds[collection]} is locked. Enter the password to read it.`;
