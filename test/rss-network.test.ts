import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
import { fetchRss, isPublicRssAddress } from '../src/server/rss-network.js';

test('public-address policy blocks IPv4, mapped IPv6, private and reserved destinations', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '192.0.2.1', '198.18.0.1', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', '::ffff:7f00:1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicRssAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicRssAddress(ip), true, ip);
});

test('controlled HTTP: explicit trusted origin, redirects, response cap, timeout and cancellation', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/feed' }); res.end(); }
    else if (req.url === '/cross') { res.writeHead(302, { location: 'http://localhost:' + (server.address() as { port: number }).port + '/feed' }); res.end(); }
    else if (req.url === '/huge') { res.end('x'.repeat(300)); }
    else if (req.url === '/bomb') { res.setHeader('content-encoding', 'gzip'); res.end(gzipSync('x'.repeat(10_000))); }
    else if (req.url === '/loop') { res.writeHead(302, { location: '/loop' }); res.end(); }
    else if (req.url === '/broken') { res.writeHead(200, { 'content-length': 200 }); res.write('half'); setTimeout(() => res.destroy(), 10); }
    else if (req.url === '/slow') { /* deliberately remains pending */ }
    else { res.setHeader('content-type', 'application/xml'); res.end('<rss><channel/></rss>'); }
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    await assert.rejects(fetchRss(base + '/feed'), /私网|保留/);
    const result = await fetchRss(base + '/redirect', { trusted: true });
    assert.equal(result.url, base + '/feed');
    await assert.rejects(fetchRss(base + '/cross', { trusted: true }), /私网|保留/);
    await assert.rejects(fetchRss(base + '/huge', { trusted: true, maxBytes: 100 }), /上限/);
    await assert.rejects(fetchRss(base + '/bomb', { trusted: true, maxBytes: 100 }), /压缩.*上限/);
    await assert.rejects(fetchRss(base + '/loop', { trusted: true }), /重定向.*上限/);
    await assert.rejects(fetchRss(base + '/broken', { trusted: true, timeoutMs: 500 }), /aborted|reset|socket/i);
    await assert.rejects(fetchRss(base + '/slow', { trusted: true, timeoutMs: 30 }), /超时/);
    const controller = new AbortController();
    const task = fetchRss(base + '/slow', { trusted: true, signal: controller.signal });
    controller.abort();
    await assert.rejects(task, /取消/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
  }
});
