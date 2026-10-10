import { getSocket } from './socket';

// Read ahead in bounded blocks, then send messages within the negotiated SCTP limit.
// Separate watermarks keep the transport fed without buffering the entire file.
const CHUNK_SIZE = 256 * 1024;
const READ_SIZE = 4 * 1024 * 1024;
const BUFFER_HIGH = 4 * 1024 * 1024;
const BUFFER_LOW = 1024 * 1024;
const PROGRESS_INTERVAL = 250;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'failed']);
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp'
    ],
    username: 'openrelay',
    credential: 'openrelay'
  }
];


class P2PFileTransferEngine {
  constructor() {
    this.transfers = new Map(); // transfer_id -> transfer state object
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    
    // Immediately provide the current state upon subscription
    const stateList = Array.from(this.transfers.values()).map(t => ({
      transfer_id: t.transfer_id,
      file_name: t.file_name,
      file_size: t.file_size,
      file_type: t.file_type,
      peer_name: t.peer_name,
      role: t.role,
      status: t.status,
      progress: t.progress,
      bytesTransferred: t.bytesTransferred,
      speedMBps: t.speedMBps,
      etaSeconds: t.etaSeconds,
      connectionType: t.connectionType,
      error: t.error,
    }));
    listener(stateList);

    return () => this.listeners.delete(listener);
  }

  notify() {
    const stateList = Array.from(this.transfers.values()).map(t => ({
      transfer_id: t.transfer_id,
      file_name: t.file_name,
      file_size: t.file_size,
      file_type: t.file_type,
      peer_name: t.peer_name,
      role: t.role, // 'sender' | 'receiver'
      status: t.status, // 'pending' | 'connecting' | 'transferring' | 'paused' | 'completed' | 'cancelled' | 'rejected'
      progress: t.progress, // percentage 0 - 100
      bytesTransferred: t.bytesTransferred,
      speedMBps: t.speedMBps,
      etaSeconds: t.etaSeconds,
      connectionType: t.connectionType,
      error: t.error,
    }));
    this.listeners.forEach(fn => fn(stateList));
  }

  initSocketListeners() {
    const socket = getSocket();
    if (!socket) return;

    socket.off('p2p_file_offer');
    socket.off('p2p_file_answer');
    socket.off('p2p_file_ice');
    socket.off('p2p_file_cancel');

    // Incoming file offer from remote peer
    socket.on('p2p_file_offer', async (data) => {
      const { sender, transfer_id, file_name, file_size, file_type, offer } = data;
      
      const transfer = {
        transfer_id,
        role: 'receiver',
        peer_id: sender.id,
        peer_name: sender.username,
        file_name,
        file_size,
        file_type,
        offer,
        status: 'pending',
        progress: 0,
        bytesTransferred: 0,
        speedMBps: 0,
        receivedChunks: [],
        pendingIceCandidates: [],
        pc: null,
        dataChannel: null
      };

      this.transfers.set(transfer_id, transfer);
      this.notify();
    });

    // Sender receives answer from receiver
    socket.on('p2p_file_answer', async (data) => {
      const { transfer_id, answer } = data;
      const transfer = this.transfers.get(transfer_id);
      if (transfer && transfer.pc) {
        await transfer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        if (transfer.pendingIceCandidates && transfer.pendingIceCandidates.length > 0) {
          for (const cand of transfer.pendingIceCandidates) {
            try {
              await transfer.pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.error("Error adding buffered sender ICE candidate", e);
            }
          }
          transfer.pendingIceCandidates = [];
        }
      }
    });

    // Received ICE candidate
    socket.on('p2p_file_ice', async (data) => {
      const { transfer_id, candidate } = data;
      const transfer = this.transfers.get(transfer_id);
      if (transfer && candidate) {
        if (transfer.pc && transfer.pc.remoteDescription) {
          try {
            await transfer.pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error("Error adding P2P ICE candidate", e);
          }
        } else {
          if (!transfer.pendingIceCandidates) {
            transfer.pendingIceCandidates = [];
          }
          transfer.pendingIceCandidates.push(candidate);
        }
      }
    });

    // Received cancellation from remote peer
    socket.on('p2p_file_cancel', (data) => {
      const { transfer_id } = data;
      const transfer = this.transfers.get(transfer_id);
      if (transfer && !TERMINAL_STATUSES.has(transfer.status)) {
        transfer.status = 'cancelled';
        this._releaseTransfer(transfer);
        this.notify();
      }
    });
  }

  // --- Sender Methods ---

  async sendFile(file, targetUser) {
    const socket = getSocket();
    if (!socket) return;

    const transfer_id = 'p2p_' + Math.random().toString(36).substr(2, 9);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const dataChannel = pc.createDataChannel('fileTransfer', { ordered: true });
    dataChannel.binaryType = 'arraybuffer';

    const transfer = {
      transfer_id,
      role: 'sender',
      file,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || 'application/octet-stream',
      peer_id: targetUser.id,
      peer_name: targetUser.username,
      status: 'connecting',
      progress: 0,
      bytesTransferred: 0,
      speedMBps: 0,
      isPaused: false,
      pc,
      dataChannel,
      offset: 0,
    };

    this.transfers.set(transfer_id, transfer);
    this._watchConnection(transfer);
    this.notify();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('p2p_file_ice', {
          target_user_id: targetUser.id,
          transfer_id,
          candidate: event.candidate,
        });
      }
    };

    dataChannel.onopen = () => {
      transfer.status = 'transferring';
      this._resetMetrics(transfer);
      dataChannel.bufferedAmountLowThreshold = BUFFER_LOW;
      dataChannel.onbufferedamountlow = () => this._startSendingFileChunks(transfer_id);
      this.notify();
      this._startSendingFileChunks(transfer_id);
    };

    // New receivers acknowledge receipt; older clients remain compatible and
    // complete when their outgoing transport queue has drained.
    dataChannel.onmessage = ({ data }) => {
      if (typeof data !== 'string' || TERMINAL_STATUSES.has(transfer.status)) return;
      try {
        const message = JSON.parse(data);
        if (message.type === 'ready' && message.version === 2) transfer.expectsReceipt = true;
        if (message.type === 'complete' && message.bytes === transfer.file_size) {
          transfer.receiptReceived = true;
          this._finishSending(transfer);
        }
      } catch { /* Ignore unknown control messages. */ }
    };

    dataChannel.onclose = () => {
      if (!TERMINAL_STATUSES.has(transfer.status)) this._failTransfer(transfer, 'The file connection closed before the transfer finished.');
    };
    dataChannel.onerror = () => this._failTransfer(transfer, 'The file connection failed. Please try again.');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('p2p_file_offer', {
      target_user_id: targetUser.id,
      transfer_id,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      offer,
    });
  }

  async _startSendingFileChunks(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (!transfer || transfer.sending || transfer.status !== 'transferring') return;

    const { file, dataChannel } = transfer;
    if (dataChannel?.readyState !== 'open') return;
    const maxMessageSize = transfer.pc?.sctp?.maxMessageSize;
    const chunkSize = Math.min(CHUNK_SIZE, maxMessageSize === 0 ? CHUNK_SIZE : (maxMessageSize || 64 * 1024));
    transfer.sending = true;
    try {
      // A single pump survives pause/resume, including a pause during an async
      // disk read. Starting another FileReader here used to duplicate chunks.
      while (transfer.status === 'transferring' && dataChannel.readyState === 'open') {
        if (transfer.offset === file.size) {
          if (file.size === 0 && !transfer.emptySent) {
            dataChannel.send(new ArrayBuffer(0));
            transfer.emptySent = true;
          }
          transfer.readBuffer = null;
          dataChannel.bufferedAmountLowThreshold = 0;
          this._finishSending(transfer);
          return;
        }
        const remaining = file.size - transfer.offset;
        if (dataChannel.bufferedAmount + Math.min(chunkSize, remaining) > BUFFER_HIGH) return;

        if (!transfer.readBuffer || transfer.readPosition === transfer.readBuffer.byteLength) {
          const block = await file.slice(transfer.offset, transfer.offset + READ_SIZE).arrayBuffer();
          if (TERMINAL_STATUSES.has(transfer.status)) return;
          if (!block.byteLength) throw new Error('The file could not be read.');
          transfer.readBuffer = new Uint8Array(block);
          transfer.readPosition = 0;
          // Pause may have arrived while reading. Keep the block for resume.
          if (transfer.status !== 'transferring') return;
        }

        const end = Math.min(transfer.readPosition + chunkSize, transfer.readBuffer.byteLength);
        const chunk = transfer.readBuffer.subarray(transfer.readPosition, end);
        dataChannel.send(chunk);
        transfer.readPosition = end;
        transfer.offset += chunk.byteLength;
        transfer.bytesTransferred = Math.max(0, transfer.offset - dataChannel.bufferedAmount);
        this._reportProgress(transfer);
      }
    } catch (error) {
      if (error.name === 'OperationError' && transfer.status === 'transferring') {
        // A full browser transport queue is transient. Keep this exact chunk
        // and retry, including when no low-water crossing remains to wake us.
        clearTimeout(transfer.retryTimer);
        transfer.retryTimer = setTimeout(() => this._startSendingFileChunks(transfer_id), 50);
      } else {
        this._failTransfer(transfer, 'The file could not be sent. Please try again.');
      }
    } finally {
      transfer.sending = false;
    }
  }

  _finishSending(transfer) {
    if (TERMINAL_STATUSES.has(transfer.status) || transfer.offset !== transfer.file_size ||
        transfer.dataChannel.bufferedAmount !== 0 || (transfer.expectsReceipt && !transfer.receiptReceived)) return;
    this._completeTransfer(transfer);
  }

  _resetMetrics(transfer) {
    if (transfer.role === 'sender') {
      transfer.bytesTransferred = Math.max(0, transfer.offset - transfer.dataChannel.bufferedAmount);
    }
    transfer.metricTime = performance.now();
    transfer.metricBytes = transfer.bytesTransferred;
    transfer.lastProgressTime = 0;
    transfer.etaSeconds = 0;
  }

  _reportProgress(transfer) {
    const now = performance.now();
    if (now - transfer.lastProgressTime < PROGRESS_INTERVAL) return;
    const seconds = (now - transfer.metricTime) / 1000;
    if (seconds >= 0.5) {
      const bytesPerSecond = (transfer.bytesTransferred - transfer.metricBytes) / seconds;
      transfer.speedMBps = (bytesPerSecond / (1024 * 1024)).toFixed(2);
      transfer.etaSeconds = bytesPerSecond > 0 ? Math.ceil((transfer.file_size - transfer.bytesTransferred) / bytesPerSecond) : 0;
      transfer.metricBytes = transfer.bytesTransferred;
      transfer.metricTime = now;
    }
    transfer.progress = transfer.file_size ? Math.min(99, Math.floor(100 * transfer.bytesTransferred / transfer.file_size)) : 0;
    transfer.lastProgressTime = now;
    this.notify();
  }

  _completeTransfer(transfer) {
    transfer.status = 'completed';
    transfer.bytesTransferred = transfer.file_size;
    transfer.progress = 100;
    transfer.speedMBps = 0;
    transfer.etaSeconds = 0;
    transfer.readBuffer = null;
    transfer.file = null;
    clearTimeout(transfer.retryTimer);
    this.notify();
  }

  _releaseTransfer(transfer) {
    clearTimeout(transfer.retryTimer);
    transfer.readBuffer = null;
    transfer.receivedChunks = [];
    transfer.file = null;
    transfer.speedMBps = 0;
    transfer.etaSeconds = 0;
    transfer.dataChannel?.close();
    transfer.pc?.close();
  }

  _failTransfer(transfer, message) {
    if (TERMINAL_STATUSES.has(transfer.status)) return;
    transfer.status = 'failed';
    transfer.error = message;
    this._releaseTransfer(transfer);
    this.notify();
  }

  _watchConnection(transfer) {
    transfer.pc.onconnectionstatechange = async () => {
      if (transfer.pc.connectionState === 'failed') {
        this._failTransfer(transfer, 'The file connection failed. Please try again.');
      } else if (transfer.pc.connectionState === 'connected') {
        try {
          const stats = await transfer.pc.getStats();
          const transport = [...stats.values()].find(s => s.type === 'transport' && s.selectedCandidatePairId);
          const pair = stats.get(transport?.selectedCandidatePairId);
          if (pair) {
            const local = stats.get(pair.localCandidateId);
            const remote = stats.get(pair.remoteCandidateId);
            transfer.connectionType = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'relay' : 'direct';
            this.notify();
          }
        } catch { /* Route diagnostics must never interrupt a transfer. */ }
      }
    };
  }

  // --- Receiver Methods ---

  async acceptTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (!transfer || transfer.status !== 'pending') return;

    const socket = getSocket();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    transfer.pc = pc;
    this._watchConnection(transfer);
    transfer.status = 'connecting';
    this.notify();

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('p2p_file_ice', {
          target_user_id: transfer.peer_id,
          transfer_id,
          candidate: event.candidate,
        });
      }
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      transfer.dataChannel = channel;
      channel.binaryType = 'arraybuffer';

      const opened = () => {
        if (transfer.status !== 'connecting') return;
        transfer.status = 'transferring';
        this._resetMetrics(transfer);
        channel.send(JSON.stringify({ type: 'ready', version: 2 }));
        this.notify();
      };
      channel.onopen = opened;
      if (channel.readyState === 'open') opened();
      channel.onclose = () => {
        if (!TERMINAL_STATUSES.has(transfer.status)) this._failTransfer(transfer, 'The file connection closed before the transfer finished.');
      };
      channel.onerror = () => this._failTransfer(transfer, 'The file connection failed. Please try again.');

      channel.onmessage = (e) => {
        if (TERMINAL_STATUSES.has(transfer.status)) return;
        if (!(e.data instanceof ArrayBuffer) || transfer.bytesTransferred + e.data.byteLength > transfer.file_size) {
          this._failTransfer(transfer, 'The received file did not match the expected size.');
          return;
        }
        transfer.receivedChunks.push(e.data);
        transfer.bytesTransferred += e.data.byteLength;

        if (transfer.bytesTransferred === transfer.file_size) {
          try {
            this._triggerFileDownload(transfer);
            channel.send(JSON.stringify({ type: 'complete', bytes: transfer.bytesTransferred }));
            transfer.receivedChunks = [];
            this._completeTransfer(transfer);
          } catch {
            this._failTransfer(transfer, 'The received file could not be saved. Please try again.');
          }
        } else {
          this._reportProgress(transfer);
        }
      };
    };

    await pc.setRemoteDescription(new RTCSessionDescription(transfer.offer));
    if (transfer.pendingIceCandidates && transfer.pendingIceCandidates.length > 0) {
      for (const cand of transfer.pendingIceCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.error("Error adding buffered receiver ICE candidate", e);
        }
      }
      transfer.pendingIceCandidates = [];
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('p2p_file_answer', {
      target_user_id: transfer.peer_id,
      transfer_id,
      answer,
    });
  }

  _triggerFileDownload(transfer) {
    const blob = new Blob(transfer.receivedChunks, { type: transfer.file_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = transfer.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Let the browser consume the download URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  pauseTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (transfer && transfer.role === 'sender' && transfer.status === 'transferring' && transfer.offset < transfer.file_size) {
      transfer.isPaused = true;
      transfer.status = 'paused';
      transfer.speedMBps = 0;
      transfer.etaSeconds = 0;
      this.notify();
    }
  }

  resumeTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (transfer && transfer.role === 'sender' && transfer.status === 'paused') {
      transfer.isPaused = false;
      transfer.status = 'transferring';
      this._resetMetrics(transfer);
      this.notify();
      this._startSendingFileChunks(transfer_id);
    }
  }

  cancelTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (transfer && !TERMINAL_STATUSES.has(transfer.status)) {
      transfer.status = 'cancelled';
      this._releaseTransfer(transfer);
      
      const socket = getSocket();
      if (socket) {
        socket.emit('p2p_file_cancel', {
          target_user_id: transfer.peer_id,
          transfer_id
        });
      }

      this.notify();
    }
  }

  resetSession() {
    for (const transfer of this.transfers.values()) {
      if (!TERMINAL_STATUSES.has(transfer.status)) this.cancelTransfer(transfer.transfer_id);
      this._releaseTransfer(transfer);
    }
    this.transfers.clear();
    this.notify();
  }
}

export const p2pEngine = new P2PFileTransferEngine();
