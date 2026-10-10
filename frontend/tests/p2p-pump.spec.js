import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { p2pEngine } = await import('/src/services/webrtcP2PFile.js');
    window.makeTransfer = (size, maxMessageSize = 16384) => {
      const engine = new p2pEngine.constructor();
      const source = new File([Uint8Array.from({ length: size }, (_, i) => (i * 19 + (i >>> 8)) & 255)], 'test.bin');
      const channel = {
        readyState: 'open', bufferedAmount: 0, sent: [], peak: 0,
        send(chunk) {
          if (this.throwOnce) { this.throwOnce = false; throw new DOMException('Queue full', 'OperationError'); }
          if (chunk.byteLength > maxMessageSize) throw new Error('Oversized message');
          this.sent.push(new Uint8Array(chunk.buffer || chunk, chunk.byteOffset || 0, chunk.byteLength).slice());
          this.bufferedAmount += chunk.byteLength;
          this.peak = Math.max(this.peak, this.bufferedAmount);
        },
        close() { this.readyState = 'closed'; },
      };
      const transfer = {
        transfer_id: 'test', role: 'sender', file: source, file_size: size,
        offset: 0, bytesTransferred: 0, status: 'transferring', dataChannel: channel,
        pc: { sctp: { maxMessageSize }, close() {} }, expectsReceipt: true,
      };
      engine.transfers.set('test', transfer);
      engine._resetMetrics(transfer);
      window.engine = engine;
      window.transfer = transfer;
      window.channel = channel;
      window.source = source;
      window.sameBytes = async () => {
        const expected = new Uint8Array(await source.arrayBuffer());
        const actual = new Uint8Array(await new Blob(channel.sent).arrayBuffer());
        return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
      };
    };
  });
});

test('bounds read-ahead and queue size, respects peer message limits, waits for receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.makeTransfer(9 * 1024 * 1024 + 333);
    let reads = 0;
    let largestRead = 0;
    transfer.file = { size: source.size, slice(start, end) {
      reads++;
      largestRead = Math.max(largestRead, end - start);
      return source.slice(start, end);
    } };
    await engine._startSendingFileChunks('test');
    const stalledOffset = transfer.offset;
    await engine._startSendingFileChunks('test');
    const respectsBackpressure = transfer.offset === stalledOffset && transfer.offset < source.size;
    while (transfer.offset < source.size) {
      channel.bufferedAmount = 0;
      await engine._startSendingFileChunks('test');
    }
    const queuedStatus = transfer.status;
    channel.bufferedAmount = 0;
    await engine._startSendingFileChunks('test');
    const drainedStatus = transfer.status;
    transfer.receiptReceived = true;
    engine._finishSending(transfer);
    return { reads, largestRead, peak: channel.peak, respectsBackpressure, queuedStatus, drainedStatus,
      finalStatus: transfer.status, identical: await window.sameBytes() };
  });
  expect(result).toEqual({ reads: 3, largestRead: 4 * 1024 * 1024, peak: 4 * 1024 * 1024,
    respectsBackpressure: true, queuedStatus: 'transferring', drainedStatus: 'transferring',
    finalStatus: 'completed', identical: true });
});

test('rapid pause and resume during a file read does not duplicate bytes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.makeTransfer(130001);
    let finishRead;
    let reads = 0;
    transfer.file = { size: source.size, slice(start, end) {
      reads++;
      return { arrayBuffer: () => new Promise(resolve => { finishRead = async () => resolve(await source.slice(start, end).arrayBuffer()); }) };
    } };
    const pending = engine._startSendingFileChunks('test');
    engine.pauseTransfer('test');
    engine.resumeTransfer('test');
    engine.resumeTransfer('test');
    await finishRead();
    await pending;
    return { reads, identical: await window.sameBytes(), offset: transfer.offset };
  });
  expect(result).toEqual({ reads: 1, identical: true, offset: 130001 });
});

test('pause retains a pending read and cancellation releases it without sending', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.makeTransfer(100001);
    let finishRead;
    transfer.file = { size: source.size, slice() {
      return { arrayBuffer: () => new Promise(resolve => { finishRead = async () => resolve(await source.arrayBuffer()); }) };
    } };
    const pending = engine._startSendingFileChunks('test');
    engine.pauseTransfer('test');
    await finishRead();
    await pending;
    const pausedBytes = channel.sent.length;
    engine.cancelTransfer('test');
    engine.resumeTransfer('test');
    return { pausedBytes, sent: channel.sent.length, status: transfer.status, released: transfer.file === null && transfer.readBuffer === null };
  });
  expect(result).toEqual({ pausedBytes: 0, sent: 0, status: 'cancelled', released: true });
});

test('transient queue errors retry the same bytes and file read failures are surfaced', async ({ page }) => {
  await page.evaluate(async () => {
    window.makeTransfer(100001);
    channel.throwOnce = true;
    await engine._startSendingFileChunks('test');
  });
  await expect.poll(() => page.evaluate(() => transfer.offset)).toBe(100001);
  expect(await page.evaluate(() => window.sameBytes())).toBe(true);
  const result = await page.evaluate(async () => {
    window.makeTransfer(10);
    transfer.file = { size: 10, slice() { return { arrayBuffer: () => Promise.reject(new Error('Disk read failed')) }; } };
    await engine._startSendingFileChunks('test');
    return { status: transfer.status, error: transfer.error, closed: channel.readyState };
  });
  expect(result.status).toBe('failed');
  expect(result.error).toContain('could not be sent');
  expect(result.closed).toBe('closed');
});

test('older receivers finish after draining and an empty file sends exactly one marker', async ({ page }) => {
  const result = await page.evaluate(async () => {
    window.makeTransfer(100001);
    transfer.expectsReceipt = false;
    await engine._startSendingFileChunks('test');
    const queuedStatus = transfer.status;
    channel.bufferedAmount = 0;
    await engine._startSendingFileChunks('test');
    const legacyStatus = transfer.status;
    window.makeTransfer(0);
    await engine._startSendingFileChunks('test');
    await engine._startSendingFileChunks('test');
    transfer.receiptReceived = true;
    engine._finishSending(transfer);
    return { queuedStatus, legacyStatus, emptyStatus: transfer.status, markers: channel.sent.length };
  });
  expect(result).toEqual({ queuedStatus: 'transferring', legacyStatus: 'completed', emptyStatus: 'completed', markers: 1 });
});
