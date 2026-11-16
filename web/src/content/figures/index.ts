import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { articleFigures } from '../../config/figures.mjs';

export type FigureName = (typeof articleFigures)[number];

/** Each interactive figure loads as its own chunk, only on pages that place it. */
export const figures: Record<FigureName, LazyExoticComponent<ComponentType>> = {
  'timestep-control': lazy(() => import('./TimestepFigure')),
};

export const isFigureName = (name: string | undefined): name is FigureName =>
  (articleFigures as readonly string[]).includes(name ?? '');
