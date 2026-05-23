import { RadioBrowserApi } from 'radio-browser-api';
import appPackage from '../../../package.json';

/**
 * Single shared radio-browser client for the renderer. The constructor string
 * is sent as the app identifier; sourcing it from package.json keeps it in
 * step with the real app version instead of a frozen literal.
 */
export const radioApi = new RadioBrowserApi(`Shiranami/${appPackage.version}`);
