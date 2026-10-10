import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

const api = 'http://127.0.0.1:8001/api';

async function connectPeers(browser, request) {
  const peers = [];
  for (const username of ['TransferSender', 'TransferReceiver']) {
    const response = await request.post(`${api}/auth/register`, { data: {
      username, email: `transfer-${crypto.randomUUID()}@example.com`,
      password: 'Alto-Transfer-Test-2026',
    } });
    expect(response.ok()).toBeTruthy();
    const account = await response.json();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await page.evaluate(async (token) => {
      const { initSocket } = await import('/src/services/socket.js');
      const { p2pEngine } = await import('/src/services/webrtcP2PFile.js');
      window.engine = p2pEngine;
      window.updates = 0;
      p2pEngine.subscribe(() => window.updates++);
      const socket = initSocket(token);
      p2pEngine.initSocketListeners();
      await new Promise((resolve, reject) => {
        socket.on('connect', resolve);
        socket.on('connect_error', reject);
      });
    }, account.access_token);
    peers.push({ context, page, ...account });
  }
  const [sender, receiver] = peers;
  const headers = { Authorization: `Bearer ${sender.access_token}` };
  const [server] = await (await request.get(`${api}/servers`, { headers })).json();
  const joined = await request.post(`${api}/servers/join`, {
    headers: { Authorization: `Bearer ${receiver.access_token}` },
    data: { invite_code: server.invite_code },
  });
  expect(joined.ok()).toBeTruthy();
  return { sender, receiver, close: () => Promise.all(peers.map(p => p.context.close())) };
}

async function offerFile(sender, receiver, size) {
  return sender.page.evaluate(async ({ target, size }) => {
    // Non-repeating, deterministic bytes catch corruption at block boundaries.
    const bytes = new Uint8Array(size);
    let seed = 123456789;
    for (let i = 0; i < bytes.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      bytes[i] = seed & 255;
    }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    window.expectedHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    await window.engine.sendFile(new File([bytes], 'transfer-test.bin'), target);
    return [...window.engine.transfers.keys()].at(-1);
  }, { target: receiver.user, size });
}

async function acceptFile(receiver, id) {
  await receiver.page.waitForFunction(id => window.engine.transfers.has(id), id);
  await receiver.page.evaluate(id => window.engine.acceptTransfer(id), id);
}

test('large direct transfer preserves every byte and records throughput', async ({ browser, request }, testInfo) => {
  const peers = await connectPeers(browser, request);
  const { sender, receiver } = peers;
  try {
    const size = 64 * 1024 * 1024 + 317;
    const id = await offerFile(sender, receiver, size);
    const downloaded = receiver.page.waitForEvent('download');
    await sender.page.evaluate(() => {
      window.engine.subscribe(transfers => {
        if (!window.sendStarted && transfers.some(t => t.status === 'transferring')) window.sendStarted = performance.now();
      });
    });
    await acceptFile(receiver, id);
    const download = await downloaded;
    const elapsed = await sender.page.evaluate(() => performance.now() - window.sendStarted);
    const bytes = await fs.readFile(await download.path());
    expect(bytes.length).toBe(size);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(await sender.page.evaluate(() => window.expectedHash));
    await expect.poll(() => sender.page.evaluate(id => window.engine.transfers.get(id).status, id)).toBe('completed');
    const updates = await Promise.all([sender, receiver].map(p => p.page.evaluate(() => window.updates)));
    for (const count of updates) expect(count).toBeLessThan(elapsed / 250 + 20);
    expect(await sender.page.evaluate(id => window.engine.transfers.get(id).connectionType, id)).toBe('direct');
    const report = { bytes: size, elapsedMs: elapsed, MiBps: size / 1048576 / (elapsed / 1000), senderUpdates: updates[0], receiverUpdates: updates[1] };
    console.log('P2P throughput:', JSON.stringify(report));
    await testInfo.attach('throughput.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  } finally { await peers.close(); }
});

test('real transfer survives repeated pause/resume, then empty transfer and cancellation', async ({ browser, request }) => {
  const peers = await connectPeers(browser, request);
  const { sender, receiver } = peers;
  try {
    const id = await offerFile(sender, receiver, 16 * 1024 * 1024 + 17);
    // Pause inside the first progress notification, while a pump is active.
    await sender.page.evaluate(id => {
      window.pausedOnce = false;
      engine.subscribe(() => {
        const t = engine.transfers.get(id);
        if (!window.pausedOnce && t.status === 'transferring' && t.offset > 0) {
          window.pausedOnce = true;
          engine.pauseTransfer(id);
        }
      });
    }, id);
    const downloaded = receiver.page.waitForEvent('download');
    await acceptFile(receiver, id);
    await expect.poll(() => sender.page.evaluate(id => engine.transfers.get(id).status, id)).toBe('paused');
    await sender.page.evaluate(id => {
      for (let i = 0; i < 10; i++) { engine.resumeTransfer(id); engine.pauseTransfer(id); }
      engine.resumeTransfer(id);
    }, id);
    const download = await downloaded;
    expect(createHash('sha256').update(await fs.readFile(await download.path())).digest('hex'))
      .toBe(await sender.page.evaluate(() => window.expectedHash));
    await expect.poll(() => sender.page.evaluate(id => engine.transfers.get(id).status, id)).toBe('completed');

    const emptyId = await offerFile(sender, receiver, 0);
    const emptyDownload = receiver.page.waitForEvent('download');
    await acceptFile(receiver, emptyId);
    expect((await fs.readFile(await (await emptyDownload).path())).length).toBe(0);
    await expect.poll(() => sender.page.evaluate(id => engine.transfers.get(id).status, emptyId)).toBe('completed');

    const cancelId = await offerFile(sender, receiver, 1024);
    await receiver.page.waitForFunction(id => engine.transfers.has(id), cancelId);
    await sender.page.evaluate(id => engine.cancelTransfer(id), cancelId);
    await expect.poll(() => receiver.page.evaluate(id => engine.transfers.get(id).status, cancelId)).toBe('cancelled');
  } finally { await peers.close(); }
});
