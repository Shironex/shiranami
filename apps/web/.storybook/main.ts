import type { StorybookConfig } from '@storybook/react-vite';

// @storybook/react-vite auto-loads the project's vite.config.ts, so the `@/`,
// `@shiranami/contracts`, and `@shiranami/shared` aliases plus the tailwind
// plugin resolve without any explicit viteFinal merging here.
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
};

export default config;
