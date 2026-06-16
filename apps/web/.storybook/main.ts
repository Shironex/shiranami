import type { StorybookConfig } from '@storybook/react-vite';

// @storybook/react-vite auto-loads the project's vite.config.ts, so the `@/`,
// `@shiranami/contracts`, and `@shiranami/shared` aliases plus the tailwind
// plugin resolve without any explicit viteFinal merging here.
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-themes',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  core: { disableTelemetry: true },
  // The brand logo is the square mascot; Storybook otherwise renders brandImage
  // up to ~100px tall, which dominates the sidebar. Cap it to a
  // sidebar-appropriate height (inline brand styles need !important to beat).
  managerHead: head =>
    `${head}<style>.sidebar-header img, img[alt='Shiranami'] { max-height: 40px !important; width: auto !important; }</style>`,
};

export default config;
