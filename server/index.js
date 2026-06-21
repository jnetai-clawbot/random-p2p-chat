const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const HEARTBEAT_INTERVAL = 30000;
const CLEANUP_INTERVAL = 60000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: clients.size, searching: searchingPool.length }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Random P2P Chat Matchmaking Server');
});

const wss = new WebSocket.Server({ server });

const clients = new Map();
const searchingPool = [];
const blockedPairs = new Map();
const skippedPairs = new Map();

function generateId() {
  return 'srv_' + Math.random().toString(36).substring(2, 10);
}

function log(msg, data = null) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${msg}`;
  console.log(entry);
  if (data) console.log(JSON.stringify(data));
}

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws, req) => {
  const clientId = generateId();
  ws.id = clientId;
  ws.isAlive = true;
  ws.peerId = null;
  ws.isSearching = false;
  ws.pairedWith = null;

  clients.set(clientId, ws);
  log(`Client connected: ${clientId}`, { totalClients: clients.size });

  ws.on('pong', heartbeat);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', code: 'SRV001', message: 'Invalid JSON' }));
      return;
    }

    switch (msg.type) {
      case 'register':
        handleRegister(ws, msg);
        break;
      case 'search':
        handleSearch(ws, msg);
        break;
      case 'cancel_search':
        handleCancelSearch(ws, msg);
        break;
      case 'block':
        handleBlock(ws, msg);
        break;
      case 'skip':
        handleSkip(ws, msg);
        break;
      case 'paired':
        handlePaired(ws, msg);
        break;
      case 'disconnect_peer':
        handleDisconnectPeer(ws, msg);
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', code: 'SRV002', message: `Unknown message type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    log(`Client error: ${clientId}`, { error: err.message });
    handleDisconnect(ws);
  });
});

function handleRegister(ws, msg) {
  if (!msg.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV003', message: 'Missing peerId' }));
    return;
  }
  ws.peerId = msg.peerId;
  log(`Client registered: ${ws.id} -> peer ${msg.peerId}`);
  ws.send(JSON.stringify({ type: 'registered', clientId: ws.id }));
}

function handleSearch(ws, msg) {
  if (!ws.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV004', message: 'Not registered' }));
    return;
  }

  if (ws.isSearching) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV005', message: 'Already searching' }));
    return;
  }

  if (ws.pairedWith) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV006', message: 'Already paired' }));
    return;
  }

  ws.isSearching = true;
  searchingPool.push(ws);
  log(`Client searching: ${ws.id} (peer ${ws.peerId})`, { poolSize: searchingPool.length });

  ws.send(JSON.stringify({ type: 'searching', poolSize: searchingPool.length }));

  tryMatch();
}

function handleCancelSearch(ws, msg) {
  removeFromPool(ws);
  ws.isSearching = false;
  ws.send(JSON.stringify({ type: 'search_cancelled' }));
  log(`Client cancelled search: ${ws.id}`);
}

function handleBlock(ws, msg) {
  if (!msg.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV007', message: 'Missing peerId to block' }));
    return;
  }

  if (!ws.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV008', message: 'Not registered' }));
    return;
  }

  if (!blockedPairs.has(ws.peerId)) {
    blockedPairs.set(ws.peerId, new Set());
  }
  blockedPairs.get(ws.peerId).add(msg.peerId);

  log(`Blocked: ${ws.peerId} blocked ${msg.peerId}`);

  if (ws.pairedWith) {
    const pairedWs = findClientByPeerId(ws.pairedWith);
    if (pairedWs) {
      pairedWs.pairedWith = null;
      pairedWs.send(JSON.stringify({ type: 'peer_disconnected', reason: 'blocked' }));
    }
    ws.pairedWith = null;
  }

  removeFromPool(ws);
  ws.isSearching = false;
  ws.send(JSON.stringify({ type: 'blocked', blockedPeerId: msg.peerId }));
}

function handleSkip(ws, msg) {
  if (!msg.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV009', message: 'Missing peerId to skip' }));
    return;
  }

  if (!ws.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV010', message: 'Not registered' }));
    return;
  }

  if (!skippedPairs.has(ws.peerId)) {
    skippedPairs.set(ws.peerId, new Set());
  }
  skippedPairs.get(ws.peerId).add(msg.peerId);

  log(`Skipped: ${ws.peerId} skipped ${msg.peerId}`);

  if (ws.pairedWith) {
    const pairedWs = findClientByPeerId(ws.pairedWith);
    if (pairedWs) {
      pairedWs.pairedWith = null;
      pairedWs.send(JSON.stringify({ type: 'peer_disconnected', reason: 'skipped' }));
    }
    ws.pairedWith = null;
  }

  removeFromPool(ws);
  ws.isSearching = false;
  ws.send(JSON.stringify({ type: 'skipped', skippedPeerId: msg.peerId }));
}

function handlePaired(ws, msg) {
  if (!msg.peerId) {
    ws.send(JSON.stringify({ type: 'error', code: 'SRV011', message: 'Missing peerId' }));
    return;
  }

  ws.pairedWith = msg.peerId;
  removeFromPool(ws);
  ws.isSearching = false;
  log(`Client paired: ${ws.id} (peer ${ws.peerId}) with ${msg.peerId}`);
}

function handleDisconnectPeer(ws, msg) {
  if (ws.pairedWith) {
    const pairedWs = findClientByPeerId(ws.pairedWith);
    if (pairedWs) {
      pairedWs.pairedWith = null;
      pairedWs.send(JSON.stringify({ type: 'peer_disconnected', reason: 'disconnected' }));
    }
    ws.pairedWith = null;
  }
  ws.send(JSON.stringify({ type: 'peer_disconnected_ack' }));
}

function handleDisconnect(ws) {
  removeFromPool(ws);
  if (ws.pairedWith) {
    const pairedWs = findClientByPeerId(ws.pairedWith);
    if (pairedWs) {
      pairedWs.pairedWith = null;
      pairedWs.send(JSON.stringify({ type: 'peer_disconnected', reason: 'disconnected' }));
    }
  }
  clients.delete(ws.id);
  log(`Client disconnected: ${ws.id}`, { totalClients: clients.size });
}

function removeFromPool(ws) {
  const idx = searchingPool.indexOf(ws);
  if (idx !== -1) {
    searchingPool.splice(idx, 1);
  }
}

function findClientByPeerId(peerId) {
  for (const [id, ws] of clients) {
    if (ws.peerId === peerId && ws.readyState === WebSocket.OPEN) {
      return ws;
    }
  }
  return null;
}

function isBlocked(peerIdA, peerIdB) {
  const blockedByA = blockedPairs.get(peerIdA);
  if (blockedByA && blockedByA.has(peerIdB)) return true;
  const blockedByB = blockedPairs.get(peerIdB);
  if (blockedByB && blockedByB.has(peerIdA)) return true;
  return false;
}

function isSkipped(peerIdA, peerIdB) {
  const skippedByA = skippedPairs.get(peerIdA);
  if (skippedByA && skippedByA.has(peerIdB)) return true;
  const skippedByB = skippedPairs.get(peerIdB);
  if (skippedByB && skippedByB.has(peerIdA)) return true;
  return false;
}

function tryMatch() {
  if (searchingPool.length < 2) return;

  const shuffled = [...searchingPool].sort(() => Math.random() - 0.5);

  const priorityPool = [];
  const lowPriorityPool = [];

  for (const ws of shuffled) {
    let isLowPriority = false;
    for (const other of shuffled) {
      if (other === ws) continue;
      if (isSkipped(ws.peerId, other.peerId)) {
        isLowPriority = true;
        break;
      }
    }
    if (isLowPriority) {
      lowPriorityPool.push(ws);
    } else {
      priorityPool.push(ws);
    }
  }

  const matchPool = priorityPool.length >= 2 ? priorityPool : [...priorityPool, ...lowPriorityPool];

  for (let i = 0; i < matchPool.length; i++) {
    for (let j = i + 1; j < matchPool.length; j++) {
      const a = matchPool[i];
      const b = matchPool[j];

      if (a.readyState !== WebSocket.OPEN || b.readyState !== WebSocket.OPEN) continue;
      if (isBlocked(a.peerId, b.peerId)) continue;

      removeFromPool(a);
      removeFromPool(b);
      a.isSearching = false;
      b.isSearching = false;

      a.send(JSON.stringify({ type: 'matched', peerId: b.peerId }));
      b.send(JSON.stringify({ type: 'matched', peerId: a.peerId }));

      log(`Matched: ${a.peerId} <-> ${b.peerId}`, { poolSize: searchingPool.length });
      return;
    }
  }
}

const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      log(`Terminating dead client: ${ws.id}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [peerId, blocked] of blockedPairs) {
    if (blocked.size === 0) blockedPairs.delete(peerId);
  }
  for (const [peerId, skipped] of skippedPairs) {
    if (skipped.size === 0) skippedPairs.delete(peerId);
  }
  log('Cleanup run', {
    clients: clients.size,
    searching: searchingPool.length,
    blockedPairs: blockedPairs.size,
    skippedPairs: skippedPairs.size
  });
}, CLEANUP_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
  clearInterval(cleanupTimer);
});

server.listen(PORT, () => {
  log(`Matchmaking server running on port ${PORT}`);
});
