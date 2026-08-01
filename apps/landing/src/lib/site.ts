import landingPackage from '../../package.json';

export const LANDING_VERSION = landingPackage.version;
export const GITHUB_REPO_URL = 'https://github.com/Shironex/shiranami';
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const GITHUB_RELEASES_LATEST_URL = `${GITHUB_RELEASES_URL}/latest`;
export const GITHUB_RELEASES_API_URL =
  'https://api.github.com/repos/Shironex/shiranami/releases/latest';

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateString));
}
