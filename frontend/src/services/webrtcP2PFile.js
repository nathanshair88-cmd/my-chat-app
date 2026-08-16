import { getSocket } from './socket';

const CHUNK_SIZE = 64 * 1024; // 64KB per chunk
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
      if (transfer && transfer.status !== 'cancelled') {
        transfer.status = 'cancelled';
        if (transfer.dataChannel) transfer.dataChannel.close();
        if (transfer.pc) transfer.pc.close();
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
      this.notify();
      this._startSendingFileChunks(transfer_id);
    };

    dataChannel.onclose = () => {
      if (transfer.status !== 'completed') {
        transfer.status = 'cancelled';
        this.notify();
      }
    };

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

  _startSendingFileChunks(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (!transfer || !transfer.dataChannel) return;

    const { file, dataChannel } = transfer;
    const fileReader = new FileReader();
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    dataChannel.bufferedAmountLowThreshold = CHUNK_SIZE * 4;

    const readSlice = (o) => {
      if (transfer.isPaused || transfer.status === 'paused' || transfer.status === 'cancelled') return;
      const slice = file.slice(o, o + CHUNK_SIZE);
      fileReader.readAsArrayBuffer(slice);
    };

    fileReader.onload = (e) => {
      if (transfer.status === 'cancelled' || transfer.isPaused) return;

      try {
        dataChannel.send(e.target.result);
      } catch (err) {
        console.error("DataChannel send error:", err);
        return;
      }

      transfer.offset += e.target.result.byteLength;
      transfer.bytesTransferred = transfer.offset;
      transfer.progress = Math.min(100, Math.round((transfer.offset / transfer.file_size) * 100));

      // Calculate speed
      bytesSinceLast += e.target.result.byteLength;
      const now = Date.now();
      const delta = (now - lastTime) / 1000;
      if (delta >= 0.5) {
        transfer.speedMBps = ((bytesSinceLast / delta) / (1024 * 1024)).toFixed(2);
        const remainingBytes = transfer.file_size - transfer.offset;
        transfer.etaSeconds = Math.round(remainingBytes / (bytesSinceLast / delta));
        bytesSinceLast = 0;
        lastTime = now;
      }

      this.notify();

      if (transfer.offset < transfer.file_size) {
        if (dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold) {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            readSlice(transfer.offset);
          };
        } else {
          readSlice(transfer.offset);
        }
      } else {
        // Sending completed
        transfer.status = 'completed';
        transfer.speedMBps = 0;
        this.notify();
      }
    };

    readSlice(transfer.offset);
  }

  // --- Receiver Methods ---

  async acceptTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (!transfer) return;

    const socket = getSocket();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    transfer.pc = pc;
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

    let lastTime = Date.now();
    let bytesSinceLast = 0;

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      transfer.dataChannel = channel;
      channel.binaryType = 'arraybuffer';

      channel.onmessage = (e) => {
        transfer.receivedChunks.push(e.data);
        transfer.bytesTransferred += e.data.byteLength;
        transfer.progress = Math.min(100, Math.round((transfer.bytesTransferred / transfer.file_size) * 100));

        bytesSinceLast += e.data.byteLength;
        const now = Date.now();
        const delta = (now - lastTime) / 1000;
        if (delta >= 0.5) {
          transfer.speedMBps = ((bytesSinceLast / delta) / (1024 * 1024)).toFixed(2);
          const remainingBytes = transfer.file_size - transfer.bytesTransferred;
          transfer.etaSeconds = Math.round(remainingBytes / (bytesSinceLast / delta));
          bytesSinceLast = 0;
          lastTime = now;
        }

        this.notify();

        if (transfer.bytesTransferred >= transfer.file_size) {
          // File completed! Auto download
          transfer.status = 'completed';
          transfer.speedMBps = 0;
          this._triggerFileDownload(transfer);
          this.notify();
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
    URL.revokeObjectURL(url);
  }

  pauseTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (transfer && transfer.role === 'sender') {
      transfer.isPaused = true;
      transfer.status = 'paused';
      transfer.speedMBps = 0;
      this.notify();
    }
  }

  resumeTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (transfer && transfer.role === 'sender') {
      transfer.isPaused = false;
      transfer.status = 'transferring';
      this.notify();
      this._startSendingFileChunks(transfer_id);
    }
  }

  cancelTransfer(transfer_id) {
    const transfer = this.transfers.get(transfer_id);
    if (transfer) {
      transfer.status = 'cancelled';
      if (transfer.dataChannel) transfer.dataChannel.close();
      if (transfer.pc) transfer.pc.close();
      
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
}

export const p2pEngine = new P2PFileTransferEngine();
