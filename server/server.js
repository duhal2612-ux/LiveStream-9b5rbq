/**
 * LiveStream Signaling Server
 * Port: 8226 | Engine: Socket.io
 * WebRTC signaling + chat relay + stream discovery
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling']
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ── State ──────────────────────────────────────────────────────────────────
/** @type {Map<string, {socketId:string, title:string, hostName:string, startedAt:number, viewers:Set<string>}>} */
const activeStreams = new Map();

/** @type {Map<string, string>} socketId → streamId (for viewers) */
const viewerStreamMap = new Map();

// ── Helpers ────────────────────────────────────────────────────────────────
function getStreamList() {
  const list = [];
  activeStreams.forEach((info, streamId) => {
    list.push({
      streamId,
      title: info.title,
      hostName: info.hostName,
      startedAt: info.startedAt,
      viewerCount: info.viewers.size
    });
  });
  return list;
}

function broadcastStreamList() {
  io.emit('streams:list', getStreamList());
}

// ── Socket Events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // ── HOST: Register Stream ────────────────────────────────────────────────
  socket.on('host:register', ({ title, hostName }) => {
    const streamId = uuidv4().slice(0, 8).toUpperCase();
    const info = {
      socketId: socket.id,
      title: title || 'Live Stream',
      hostName: hostName || 'Host',
      startedAt: Date.now(),
      viewers: new Set()
    };
    activeStreams.set(streamId, info);
    socket.join(`stream:${streamId}`);
    socket.data.role = 'host';
    socket.data.streamId = streamId;

    socket.emit('host:registered', { streamId });
    console.log(`[HOST] Registered stream ${streamId} — "${info.title}"`);
    broadcastStreamList();
  });

  // ── VIEWER: Get Stream List ──────────────────────────────────────────────
  socket.on('get:streams', () => {
    socket.emit('streams:list', getStreamList());
  });

  // ── VIEWER: Join Stream ──────────────────────────────────────────────────
  socket.on('viewer:join', ({ streamId, viewerName }) => {
    const stream = activeStreams.get(streamId);
    if (!stream) {
      socket.emit('error:stream', { message: 'Stream tidak ditemukan atau sudah berakhir.' });
      return;
    }
    socket.join(`stream:${streamId}`);
    socket.data.role = 'viewer';
    socket.data.streamId = streamId;
    socket.data.viewerName = viewerName || 'Penonton';

    stream.viewers.add(socket.id);
    viewerStreamMap.set(socket.id, streamId);

    // Notify host to initiate WebRTC offer to this viewer
    io.to(stream.socketId).emit('viewer:joined', {
      viewerId: socket.id,
      viewerName: socket.data.viewerName
    });

    // Update viewer count
    io.to(`stream:${streamId}`).emit('viewer:count', { count: stream.viewers.size });
    broadcastStreamList();

    console.log(`[VIEWER] ${socket.id} joined stream ${streamId}`);
  });

  // ── WebRTC Signaling: Offer (Host → Viewer) ──────────────────────────────
  socket.on('rtc:offer', ({ targetId, offer }) => {
    io.to(targetId).emit('rtc:offer', {
      from: socket.id,
      offer
    });
  });

  // ── WebRTC Signaling: Answer (Viewer → Host) ─────────────────────────────
  socket.on('rtc:answer', ({ targetId, answer }) => {
    io.to(targetId).emit('rtc:answer', {
      from: socket.id,
      answer
    });
  });

  // ── WebRTC Signaling: ICE Candidate ─────────────────────────────────────
  socket.on('rtc:ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('rtc:ice', {
      from: socket.id,
      candidate
    });
  });

  // ── Chat: Message Relay ──────────────────────────────────────────────────
  socket.on('chat:send', ({ streamId, message, name, role }) => {
    const stream = activeStreams.get(streamId);
    if (!stream) return;

    const payload = {
      id: uuidv4(),
      name: name || (role === 'host' ? 'Host' : 'Penonton'),
      message,
      role,
      ts: Date.now()
    };
    io.to(`stream:${streamId}`).emit('chat:message', payload);
  });

  // ── HOST: End Stream ─────────────────────────────────────────────────────
  socket.on('host:end', () => {
    const streamId = socket.data.streamId;
    if (streamId && socket.data.role === 'host') {
      io.to(`stream:${streamId}`).emit('stream:ended');
      activeStreams.delete(streamId);
      broadcastStreamList();
      console.log(`[HOST] Stream ${streamId} ended.`);
    }
  });

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { role, streamId } = socket.data || {};
    console.log(`[DISCONNECT] ${socket.id} (${role || 'unknown'})`);

    if (role === 'host' && streamId) {
      io.to(`stream:${streamId}`).emit('stream:ended');
      activeStreams.delete(streamId);
      broadcastStreamList();
    } else if (role === 'viewer' && streamId) {
      const stream = activeStreams.get(streamId);
      if (stream) {
        stream.viewers.delete(socket.id);
        viewerStreamMap.delete(socket.id);
        io.to(`stream:${streamId}`).emit('viewer:count', { count: stream.viewers.size });
        // Notify host viewer left
        io.to(stream.socketId).emit('viewer:left', { viewerId: socket.id });
        broadcastStreamList();
      }
    }
  });
});

// ── Start Server ───────────────────────────────────────────────────────────
const PORT = 8226;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔴 LiveStream Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Host  → http://localhost:${PORT}/host.html`);
  console.log(`   Watch → http://localhost:${PORT}/watch.html\n`);
});
