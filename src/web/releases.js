import { SITE, GECKO_ID, PACKAGE_NAME } from '../site.js';

export const DOWNLOADS_DIR = 'downloads';

const versionParts = (version) => version.split('.').map(Number);

export const compareVersions = (a, b) => {
  const [left, right] = [versionParts(a), versionParts(b)];
  const diff = left.map((part, i) => part - (right[i] ?? 0)).find((value) => value !== 0);
  return diff ?? left.length - right.length;
};

export const newestFirst = (releases) => [...releases].sort((a, b) => compareVersions(b.version, a.version));

export const fileNames = (version) => ({
  chromium: `${PACKAGE_NAME}-${version}-chrome-opera.zip`,
  firefox: `${PACKAGE_NAME}-${version}-firefox.xpi`,
});

export const downloadPath = (file) => `/${DOWNLOADS_DIR}/${file}`;

export const updateManifest = (signed) => ({
  addons: {
    [GECKO_ID]: {
      updates: newestFirst(signed).map(({ version, file, sha256 }) => ({
        version,
        update_link: `${SITE.url}${downloadPath(file)}`,
        update_hash: `sha256:${sha256}`,
      })),
    },
  },
});

export const redirects = ({ chromium, firefox }) => [
  `/chrome ${downloadPath(chromium)} 302`,
  `/opera ${downloadPath(chromium)} 302`,
  `/firefox ${firefox ? downloadPath(firefox) : '/#firefox'} 302`,
].join('\n').concat('\n');

export const headers = (signed) => [
  '/updates.json',
  '  Cache-Control: no-cache',
  ...signed.flatMap(({ file }) => [downloadPath(file), '  Content-Type: application/x-xpinstall']),
].join('\n').concat('\n');
