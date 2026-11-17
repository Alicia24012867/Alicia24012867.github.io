import { allFeatures, featuresOn } from './feature-flags.mjs';

/** What each feature is, and how to try one: see feature-flags.mjs. */
export type Feature = (typeof allFeatures)[number];

const on = featuresOn(import.meta.env.VITE_FEATURES);

export const features = Object.fromEntries(
  allFeatures.map((name) => [name, on.has(name)]),
) as Record<Feature, boolean>;
