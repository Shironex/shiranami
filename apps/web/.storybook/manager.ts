import { addons } from 'storybook/manager-api';
import { shiranamiTheme } from './shiranami-theme';

// Brand the Storybook manager UI (sidebar, toolbar, logo) to match Shiranami.
addons.setConfig({ theme: shiranamiTheme });
