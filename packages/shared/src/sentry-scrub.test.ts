import { describe, it, expect } from 'vitest';
import { scrubPath, containsHomePath, scrubEvent, scrubBreadcrumb } from './sentry-scrub';

const USERNAME = 'alice';

describe('scrubPath', () => {
  it('strips a macOS home-dir prefix and the username', () => {
    const out = scrubPath(`/Users/${USERNAME}/Music/track.flac`);
    expect(out).toBe('~/Music/track.flac');
    expect(out).not.toContain(USERNAME);
  });

  it('strips a Linux home-dir prefix and the username', () => {
    const out = scrubPath(`/home/${USERNAME}/code/app.js`);
    expect(out).toBe('~/code/app.js');
    expect(out).not.toContain(USERNAME);
  });

  it('strips a Windows home-dir prefix and the username', () => {
    const out = scrubPath(`C:\\Users\\${USERNAME}\\AppData\\Local\\app.exe`);
    expect(out).toBe('~\\AppData\\Local\\app.exe');
    expect(out).not.toContain(USERNAME);
  });

  it('collapses a bare home directory to ~', () => {
    expect(scrubPath(`/Users/${USERNAME}`)).toBe('~');
  });

  it('scrubs multiple paths in one string', () => {
    const out = scrubPath(`from /Users/${USERNAME}/a.js to /Users/${USERNAME}/b.js`);
    expect(out).toBe('from ~/a.js to ~/b.js');
    expect(out).not.toContain(USERNAME);
  });

  it('leaves non-home paths untouched', () => {
    expect(scrubPath('/usr/local/bin/node')).toBe('/usr/local/bin/node');
    expect(scrubPath('/Applications/Shiranami.app')).toBe('/Applications/Shiranami.app');
  });
});

describe('containsHomePath', () => {
  it('detects a home path regardless of repeated calls (lastIndex reset)', () => {
    const sample = `/Users/${USERNAME}/x`;
    expect(containsHomePath(sample)).toBe(true);
    expect(containsHomePath(sample)).toBe(true);
  });

  it('returns false for paths without a home dir', () => {
    expect(containsHomePath('/var/log/system.log')).toBe(false);
  });
});

describe('scrubEvent', () => {
  it('strips the username from every stack frame filename and abs_path', () => {
    const event = {
      message: `crash in /Users/${USERNAME}/app/index.js`,
      exception: {
        values: [
          {
            value: `ENOENT: /Users/${USERNAME}/Music/missing.flac`,
            stacktrace: {
              frames: [
                {
                  filename: `/Users/${USERNAME}/app/dist/main/index.js`,
                  abs_path: `/Users/${USERNAME}/app/dist/main/index.js`,
                  module: `/Users/${USERNAME}/app/dist/main/index`,
                },
                {
                  filename: `C:\\Users\\${USERNAME}\\app\\renderer.js`,
                  abs_path: `C:\\Users\\${USERNAME}\\app\\renderer.js`,
                },
              ],
            },
          },
        ],
      },
    };

    const scrubbed = scrubEvent(event);
    const serialized = JSON.stringify(scrubbed);

    expect(serialized).not.toContain(USERNAME);
    expect(scrubbed.message).toBe('crash in ~/app/index.js');
    expect(scrubbed.exception.values[0].value).toBe('ENOENT: ~/Music/missing.flac');
    expect(scrubbed.exception.values[0].stacktrace.frames[0].filename).toBe(
      '~/app/dist/main/index.js'
    );
    expect(scrubbed.exception.values[0].stacktrace.frames[1].filename).toBe('~\\app\\renderer.js');
  });

  it('scrubs embedded breadcrumb messages and drops console breadcrumbs with paths', () => {
    const event = {
      breadcrumbs: [
        { category: 'console', message: `loaded /Users/${USERNAME}/cfg.json` },
        { category: 'navigation', message: `opened /Users/${USERNAME}/lib` },
        { category: 'ui.click', message: 'clicked Play' },
      ],
    };

    const scrubbed = scrubEvent(event);
    expect(JSON.stringify(scrubbed)).not.toContain(USERNAME);
    // console breadcrumb carrying a home path is dropped entirely
    expect(scrubbed.breadcrumbs).toHaveLength(2);
    expect(scrubbed.breadcrumbs[0].message).toBe('opened ~/lib');
    expect(scrubbed.breadcrumbs[1].message).toBe('clicked Play');
  });

  it('returns the event unchanged when there is nothing to scrub', () => {
    const event = { message: 'plain error', exception: { values: [{ value: 'oops' }] } };
    const scrubbed = scrubEvent(event);
    expect(scrubbed.message).toBe('plain error');
    expect(scrubbed.exception.values[0].value).toBe('oops');
  });
});

describe('scrubBreadcrumb', () => {
  it('drops a console breadcrumb that contains a home path', () => {
    const crumb = { category: 'console', message: `read /Users/${USERNAME}/secret` };
    expect(scrubBreadcrumb(crumb)).toBeNull();
  });

  it('keeps a console breadcrumb without a home path', () => {
    const crumb = { category: 'console', message: 'app ready' };
    const out = scrubBreadcrumb(crumb);
    expect(out).not.toBeNull();
    expect(out!.message).toBe('app ready');
  });

  it('scrubs the path out of a non-console breadcrumb message', () => {
    const crumb = { category: 'navigation', message: `to /Users/${USERNAME}/page` };
    const out = scrubBreadcrumb(crumb);
    expect(out!.message).toBe('to ~/page');
    expect(out!.message).not.toContain(USERNAME);
  });

  it('scrubs home paths inside breadcrumb data values', () => {
    const crumb = {
      category: 'http',
      message: 'request',
      data: { url: `file:///Users/${USERNAME}/x.json`, status: 200 },
    };
    const out = scrubBreadcrumb(crumb);
    expect(out!.data!.url).toBe('file://~/x.json');
    expect(out!.data!.status).toBe(200);
    expect(JSON.stringify(out)).not.toContain(USERNAME);
  });
});
