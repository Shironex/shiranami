import { beforeAll } from 'vitest';
import { setProjectAnnotations } from '@storybook/react-vite';
import * as projectAnnotations from './preview';

// Apply the preview's project annotations (decorators, parameters, and the
// global `beforeEach` theme/background reset) to every story test. Without this,
// @storybook/addon-vitest does not reliably run the preview-level `beforeEach`
// in the browser run, so a story that switches the app theme bleeds `data-theme`
// into later stories' axe runs (dark background + light foreground → contrast
// failures), intermittently depending on file execution order.
// See: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
const project = setProjectAnnotations([projectAnnotations]);

beforeAll(project.beforeAll);
