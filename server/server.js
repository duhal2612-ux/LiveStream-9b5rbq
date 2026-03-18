/**
 * LiveStream Signaling Server v2
 * Port: 8226 | Co-host + Grid + Full Controls
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
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

/**
 * Stream record:
 * {
 *   socketId, title, hostName, startedAt,
 *   viewers: Set<socketId>,
 *   cohosts: Set<socketId>   ← active co-hosts
 *   cohostRequests: Set<socketId> ← pending requests
 * }
 */
const activeStreams = new Map();
const viewerStreamMap = new Map(); // socketId → streamId

function getStreamList() {
  const list = [];
  activeStreams.forEach((info, streamId) => {
    list.push({
      streamId,
      title: info.title,
      hostName: info.hostName,
      startedAt: info.startedAt,
      viewerCount: info.viewers.size,
      cohostCount: info.cohosts.size
    });
  });
  return list;
}

function broadcastStreamList() {
  io.emit('streams:list', getStreamList());
}

function relay(targetId, event, data) {
  io.to(targetId).emit(event, data);
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ── HOST: Register ──────────────────────────────────────────────────────
  socket.on('host:register', ({ title, hostName }) => {
    const streamId = uuidv4().slice(0, 8).toUpperCase();
    activeStreams.set(streamId, {
      socketId: socket.id,
      title: title || 'Live Stream',
      hostName: hostName || 'Host',
      startedAt: Date.now(),
      viewers: new Set(),
      cohosts: new Set(),
      cohostRequests: new Set()
    });
    socket.join(`stream:${streamId}`);
    socket.data.role = 'host';
    socket.data.streamId = streamId;
    socket.data.displayName = hostName || 'Host';
    socket.emit('host:registered', { streamId });
    console.log(`[HOST] ${streamId} — "${title}"`);
    broadcastStreamList();
  });

  // ── Discovery ───────────────────────────────────────────────────────────
  socket.on('get:streams', () => socket.emit('streams:list', getStreamList()));

  // ── VIEWER: Join Stream ─────────────────────────────────────────────────
  socket.on('viewer:join', ({ streamId, viewerName }) => {
    const stream = activeStreams.get(streamId);
    if (!stream) { socket.emit('error:stream', { message: 'Stream tidak ditemukan.' }); return; }

    socket.join(`stream:${streamId}`);
    socket.data.role = 'viewer';
    socket.data.streamId = streamId;
    socket.data.displayName = viewerName || 'Penonton';

    stream.viewers.add(socket.id);
    viewerStreamMap.set(socket.id, streamId);

    relay(stream.socketId, 'viewer:joined', { viewerId: socket.id, viewerName: socket.data.displayName });
    io.to(`stream:${streamId}`).emit('viewer:count', { count: stream.viewers.size });
    broadcastStreamList();
    console.log(`[VIEWER] ${socket.id} → ${streamId}`);
  });

  // ── CO-HOST: Viewer requests to join as co-host ─────────────────────────
  socket.on('cohost:request', ({ streamId }) => {
    const stream = activeStreams.get(streamId);
    if (!stream) return;
    stream.cohostRequests.add(socket.id);
    socket.data.cohostStreamId = streamId;
    relay(stream.socketId, 'cohost:request', {
      viewerId: socket.id,
      viewerName: socket.data.displayName || 'Penonton'
    });
    console.log(`[COHOST-REQ] ${socket.id} → ${streamId}`);
  });

  // ── CO-HOST: Host accepts ───────────────────────────────────────────────
  socket.on('cohost:accept', ({ viewerId }) => {
    const streamId = socket.data.streamId;
    const stream = activeStreams.get(streamId);
    if (!stream) return;
    stream.cohostRequests.delete(viewerId);
    stream.cohosts.add(viewerId);
    // Tell viewer they're accepted & host's socket id for signaling
    relay(viewerId, 'cohost:accepted', { hostId: socket.id, streamId });
    // Tell host to initiate WebRTC offer to this co-host
    relay(socket.id, 'cohost:initiate', { viewerId });
    io.to(`stream:${streamId}`).emit('cohost:list', { cohosts: [...stream.cohosts] });
    broadcastStreamList();
    console.log(`[COHOST-ACC] ${viewerId} accepted in ${streamId}`);
  });

  // ── CO-HOST: Host rejects ───────────────────────────────────────────────
  socket.on('cohost:reject', ({ viewerId }) => {
    const streamId = socket.data.streamId;
    const stream = activeStreams.get(streamId);
    if (stream) stream.cohostRequests.delete(viewerId);
    relay(viewerId, 'cohost:rejected', {});
  });

  // ── CO-HOST: Leave ──────────────────────────────────────────────────────
  socket.on('cohost:leave', ({ streamId }) => {
    const stream = activeStreams.get(streamId);
    if (!stream) return;
    stream.cohosts.delete(socket.id);
    relay(stream.socketId, 'cohost:left', { viewerId: socket.id });
    io.to(`stream:${streamId}`).emit('cohost:list', { cohosts: [...stream.cohosts] });
    broadcastStreamList();
  });

  // ── HOST: Kick co-host ──────────────────────────────────────────────────
  socket.on('cohost:kick', ({ viewerId }) => {
    const streamId = socket.data.streamId;
    const stream = activeStreams.get(streamId);
    if (!stream) return;
    stream.cohosts.delete(viewerId);
    relay(viewerId, 'cohost:kicked', {});
    io.to(`stream:${streamId}`).emit('cohost:list', { cohosts: [...stream.cohosts] });
    broadcastStreamList();
  });

  // ── WebRTC: Generic signaling relay ────────────────────────────────────
  socket.on('rtc:offer',  ({ targetId, offer, label })    => relay(targetId, 'rtc:offer',  { from: socket.id, offer, label }));
  socket.on('rtc:answer', ({ targetId, answer, label })   => relay(targetId, 'rtc:answer', { from: socket.id, answer, label }));
  socket.on('rtc:ice',    ({ targetId, candidate, label })=> relay(targetId, 'rtc:ice',    { from: socket.id, candidate, label }));

  // ── Chat relay ──────────────────────────────────────────────────────────
  socket.on('chat:send', ({ streamId, message, name, role }) => {
    const stream = activeStreams.get(streamId);
    if (!stream) return;
    const payload = { id: uuidv4(), name: name || 'Anonim', message, role, ts: Date.now() };
    io.to(`stream:${streamId}`).emit('chat:message', payload);
  });

  // ── HOST: End stream ────────────────────────────────────────────────────
  socket.on('host:end', () => {
    const { streamId } = socket.data;
    if (streamId && socket.data.role === 'host') {
      io.to(`stream:${streamId}`).emit('stream:ended');
      activeStreams.delete(streamId);
      broadcastStreamList();
      console.log(`[END] ${streamId}`);
    }
  });

  // ── Disconnect ──────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const { role, streamId, displayName } = socket.data || {};
    console.log(`[-] ${socket.id} (${role})`);

    if (role === 'host' && streamId) {
      io.to(`stream:${streamId}`).emit('stream:ended');
      activeStreams.delete(streamId);
      broadcastStreamList();
    } else if (streamId) {
      const stream = activeStreams.get(streamId);
      if (stream) {
        stream.viewers.delete(socket.id);
        stream.cohosts.delete(socket.id);
        stream.cohostRequests.delete(socket.id);
        viewerStreamMap.delete(socket.id);
        io.to(`stream:${streamId}`).emit('viewer:count', { count: stream.viewers.size });
        relay(stream.socketId, 'viewer:left', { viewerId: socket.id });
        relay(stream.socketId, 'cohost:left', { viewerId: socket.id });
        io.to(`stream:${streamId}`).emit('cohost:list', { cohosts: [...stream.cohosts] });
        broadcastStreamList();
      }
    }
  });
});

const PORT = 8226;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🔴 LiveStream v2 → http://0.0.0.0:${PORT}`);
  console.log(`   Host  → http://localhost:${PORT}/host.html`);
  console.log(`   Watch → http://localhost:${PORT}/watch.html\n`);
});
