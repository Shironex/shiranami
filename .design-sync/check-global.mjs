import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const OUT = 'ds-bundle';
const types = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
};
const srv = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(OUT, u);
  try {
    if (existsSync(p) && statSync(p).isFile()) {
      res.setHeader('content-type', types[extname(p)] || 'text/plain');
      res.end(readFileSync(p));
      return;
    }
  } catch {}
  res.setHeader('content-type', 'text/html');
  res.end('<!doctype html>');
});
await new Promise(r => srv.listen(0, r));
const port = srv.address().port;
const b = await chromium.launch();
const pg = await b.newPage();
const errs = [];
pg.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await pg.goto(`http://127.0.0.1:${port}/`);
await pg.setContent(
  '<!doctype html><script src="/_vendor/react.js"></script><script src="/_vendor/react-dom.js"></script><script src="/_ds_bundle.js"></script>'
);
await pg.waitForFunction(() => !!window.ShiranamiWeb, { timeout: 15000 }).catch(() => {});
const r = await pg.evaluate(() => {
  const NS = window.ShiranamiWeb || {};
  const keys = Object.keys(NS);
  const fn = keys.filter(k => typeof NS[k] === 'function' || (NS[k] && NS[k].$$typeof));
  return {
    total: keys.length,
    fnCount: fn.length,
    hasReact: !!window.React,
    sampleBad: keys
      .filter(k => !(typeof NS[k] === 'function' || (NS[k] && NS[k].$$typeof)))
      .slice(0, 8),
    sampleGood: fn.slice(0, 3),
  };
});
console.log(JSON.stringify(r));
console.log('pageerrors:', JSON.stringify(errs.slice(0, 3)));
await b.close();
srv.close();
