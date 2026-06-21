(function() {
    const STUN_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ];

    const TURN_SERVERS = [
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ];

    const LOBBY_PREFIX = 'random-p2p-lobby-';
    const LOBBY_SLOT_SECS = 30;

    let peer = null;
    let conn = null;
    let localId = null;
    let persistentId = null;
    let qrCode = null;
    let remotePeerId = null;
    let isUserEndingChat = false;
    let isSearching = false;
    let searchRetryCount = 0;
    let searchRetryTimer = null;
    let lobbyPeer = null;
    let lobbyConn = null;
    let blockedPeers = new Set();
    let skippedPeers = new Set();
    let knownPeers = new Map();
    let mediaCall = null;
    let localStream = null;
    let isInCall = false;
    let isCallInitiator = false;
    let voiceNoteRecorder = null;
    let voiceNoteChunks = [];
    let voiceNoteTimer = null;
    let voiceNoteSeconds = 0;

    const elements = {
        localId: document.getElementById('local-id'),
        remoteIdInput: document.getElementById('remote-id-input'),
        connectBtn: document.getElementById('connect-btn'),
        scanQrBtn: document.getElementById('scan-qr-btn'),
        newIdBtn: document.getElementById('new-id-btn'),
        copyIdBtn: document.getElementById('copy-id-btn'),
        status: document.getElementById('connection-status'),
        chatSection: document.getElementById('chat-section'),
        idSection: document.getElementById('id-section'),
        connectSection: document.getElementById('connect-section'),
        randomSection: document.getElementById('random-section'),
        chatMessages: document.getElementById('chat-messages'),
        messageInput: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        pickFileBtn: document.getElementById('pick-file-btn'),
        nudgeBtn: document.getElementById('nudge-btn'),
        endChatBtn: document.getElementById('end-chat-btn'),
        blockBtn: document.getElementById('block-btn'),
        skipBtn: document.getElementById('skip-btn'),
        connectRandomBtn: document.getElementById('connect-random-btn'),
        cancelSearchBtn: document.getElementById('cancel-search-btn'),
        searchStatus: document.getElementById('search-status'),
        searchStatusText: document.getElementById('search-status-text'),
        debugLog: document.getElementById('debug-log'),
        qrContainer: document.getElementById('qrcode-container'),
        openSettingsBtn: document.getElementById('open-settings-btn'),
        closeSettingsBtn: document.getElementById('close-settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        checkUpdateBtn: document.getElementById('check-update-btn'),
        shareAppBtn: document.getElementById('share-app-btn'),
        publicIp: document.getElementById('public-ip'),
        webrtcSupport: document.getElementById('webrtc-support'),
        voiceNoteBtn: document.getElementById('voice-note-btn'),
        voiceCallBtn: document.getElementById('voice-call-btn'),
        videoCallBtn: document.getElementById('video-call-btn'),
        callOverlay: document.getElementById('call-overlay'),
        remoteVideo: document.getElementById('remote-video'),
        localVideo: document.getElementById('local-video'),
        toggleMicBtn: document.getElementById('toggle-mic-btn'),
        toggleCamBtn: document.getElementById('toggle-cam-btn'),
        toggleSpeakerBtn: document.getElementById('toggle-speaker-btn'),
        hangupBtn: document.getElementById('hangup-btn'),
        callStatusText: document.getElementById('call-status-text'),
        voiceNoteIndicator: document.getElementById('voice-note-indicator'),
        voiceNoteTimer: document.getElementById('voice-note-timer'),
        blockedModal: document.getElementById('blocked-modal'),
        blockedList: document.getElementById('blocked-list'),
        closeBlockedBtn: document.getElementById('close-blocked-btn'),
        knownModal: document.getElementById('known-modal'),
        knownList: document.getElementById('known-list'),
        closeKnownBtn: document.getElementById('close-known-btn'),
        showBlockedBtn: document.getElementById('show-blocked-btn'),
        showKnownBtn: document.getElementById('show-known-btn')
    };

    const settings = {
        autoReconnect: document.getElementById('setting-auto-reconnect'),
        screenOn: document.getElementById('setting-screen-on'),
        allowFiles: document.getElementById('setting-allow-files'),
        saveFolder: document.getElementById('setting-save-folder'),
        vibrate: document.getElementById('setting-vibrate'),
        useTurn: document.getElementById('setting-use-turn'),
        debug: document.getElementById('setting-debug'),
        ipv4: document.getElementById('setting-ipv4'),
        ipv6: document.getElementById('setting-ipv6'),
        tcp: document.getElementById('setting-tcp'),
        udp: document.getElementById('setting-udp'),
        proxyUrl: document.getElementById('setting-proxy-url')
    };

    const GITHUB_REPO_URL = 'https://github.com/jnetai-clawbot/random-p2p-chat/releases';
    const SETTINGS_KEY = 'p2pchat_settings';
    const BLOCKED_KEY = 'p2pchat_blocked';
    const KNOWN_KEY = 'p2pchat_known';

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
            if (saved) {
                if (saved.autoReconnect !== undefined) settings.autoReconnect.checked = saved.autoReconnect;
                if (saved.screenOn !== undefined) settings.screenOn.checked = saved.screenOn;
                if (saved.allowFiles !== undefined) settings.allowFiles.checked = saved.allowFiles;
                if (saved.vibrate !== undefined) settings.vibrate.checked = saved.vibrate;
                if (saved.useTurn !== undefined) settings.useTurn.checked = saved.useTurn;
                if (saved.debug !== undefined) settings.debug.checked = saved.debug;
                if (saved.saveFolder !== undefined) settings.saveFolder.value = saved.saveFolder;
                if (saved.ipv4 !== undefined) settings.ipv4.checked = saved.ipv4;
                if (saved.ipv6 !== undefined) settings.ipv6.checked = saved.ipv6;
                if (saved.tcp !== undefined) settings.tcp.checked = saved.tcp;
                if (saved.udp !== undefined) settings.udp.checked = saved.udp;
                if (saved.proxyUrl !== undefined) settings.proxyUrl.value = saved.proxyUrl;
            }
        } catch (e) { /* ignore */ }
    }

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({
                autoReconnect: settings.autoReconnect.checked,
                screenOn: settings.screenOn.checked,
                allowFiles: settings.allowFiles.checked,
                vibrate: settings.vibrate.checked,
                useTurn: settings.useTurn.checked,
                debug: settings.debug.checked,
                saveFolder: settings.saveFolder.value,
                ipv4: settings.ipv4.checked,
                ipv6: settings.ipv6.checked,
                tcp: settings.tcp.checked,
                udp: settings.udp.checked,
                proxyUrl: settings.proxyUrl.value
            }));
        } catch (e) { /* ignore */ }
    }

    function loadBlockedPeers() {
        try {
            const saved = JSON.parse(localStorage.getItem(BLOCKED_KEY));
            if (saved && Array.isArray(saved)) {
                blockedPeers = new Set(saved);
            }
        } catch (e) { /* ignore */ }
    }

    function saveBlockedPeers() {
        try {
            localStorage.setItem(BLOCKED_KEY, JSON.stringify([...blockedPeers]));
        } catch (e) { /* ignore */ }
    }

    function loadKnownPeers() {
        try {
            const saved = JSON.parse(localStorage.getItem(KNOWN_KEY));
            if (saved && typeof saved === 'object') {
                knownPeers = new Map(Object.entries(saved));
            }
        } catch (e) { /* ignore */ }
    }

    function saveKnownPeers() {
        try {
            localStorage.setItem(KNOWN_KEY, JSON.stringify(Object.fromEntries(knownPeers)));
        } catch (e) { /* ignore */ }
    }

    function log(msg, isError = false) {
        if (!settings.debug.checked && !isError) return;
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.textContent = `[${time}] ${msg}`;
        if (isError) entry.style.color = '#f44336';
        elements.debugLog.prepend(entry);
        if (window.AndroidBridge) window.AndroidBridge.log(msg);
    }

    function generateRandomId() {
        return Math.floor(1000 + Math.random() * 999999).toString();
    }

    function detectNetwork() {
        elements.webrtcSupport.textContent = (window.RTCPeerConnection) ? "Supported" : "Not Supported";
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => { elements.publicIp.textContent = data.ip; })
            .catch(() => { elements.publicIp.textContent = "Unable to detect"; });
    }

    function applyScreenSetting() {
        if (window.AndroidBridge) {
            window.AndroidBridge.setKeepScreenOn(settings.screenOn.checked);
        }
    }

    function buildIceServers() {
        const servers = [];
        if (settings.ipv4.checked) {
            servers.push(...STUN_SERVERS);
        }
        if (settings.useTurn.checked) {
            const turns = [...TURN_SERVERS];
            if (!settings.udp.checked) {
                for (let i = turns.length - 1; i >= 0; i--) {
                    if (!turns[i].urls.includes('transport=tcp')) {
                        turns.splice(i, 1);
                    }
                }
            }
            if (!settings.tcp.checked) {
                for (let i = turns.length - 1; i >= 0; i--) {
                    if (turns[i].urls.includes('transport=tcp')) {
                        turns.splice(i, 1);
                    }
                }
            }
            servers.push(...turns);
        }
        if (settings.proxyUrl.value.trim()) {
            const proxy = settings.proxyUrl.value.trim();
            servers.push({ urls: proxy });
        }
        return servers;
    }

    function initPeer() {
        if (peer) peer.destroy();
        const idToUse = generateRandomId();
        const iceServers = buildIceServers();
        peer = new Peer(idToUse, {
            config: { iceServers: iceServers, iceTransportPolicy: 'all' },
            debug: 1
        });
        peer.on('open', (id) => {
            localId = id;
            elements.localId.textContent = id;
            updateStatus('Disconnected', 'status-disconnected');
            generateQrCode(id);
        });
        peer.on('connection', (connection) => {
            if (conn) { connection.close(); return; }
            setupConnection(connection);
        });
        peer.on('call', (call) => {
            log(`Incoming call from ${call.peer}`);
            if (isInCall) { call.close(); return; }
            answerIncomingCall(call);
        });
        peer.on('error', (err) => {
            log(`Peer error: ${err.type}`, true);
            if (err.type === 'unavailable-id') initPeer();
        });
    }

    function generateQrCode(text) {
        elements.qrContainer.innerHTML = '';
        qrCode = new QRCode(elements.qrContainer, {
            text: text, width: 150, height: 150,
            colorDark: "#000000", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    function setupConnection(connection) {
        conn = connection;
        remotePeerId = conn.peer;
        isUserEndingChat = false;
        conn.on('open', () => {
            updateStatus(`Connected to ${conn.peer}`, 'status-connected');
            showChat();
            addMessage(`System: Connected to ${conn.peer}`, 'system');
            addKnownPeer(conn.peer);
        });
        conn.on('data', handleReceivedData);
        conn.on('close', () => {
            updateStatus('Disconnected', 'status-disconnected');
            addMessage('System: Connection closed', 'system');
            if (!isUserEndingChat && settings.autoReconnect.checked && remotePeerId) {
                setTimeout(() => connectToPeer(remotePeerId), 3000);
            } else {
                hideChat();
                conn = null;
                remotePeerId = null;
            }
        });
    }

    function handleReceivedData(data) {
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'chat') addMessage(msg.text, 'received');
                else if (msg.type === 'nudge') handleNudge();
                else if (msg.type === 'voice_note') handleReceivedVoiceNote(msg);
            } catch (e) { addMessage(data, 'received'); }
        } else if (typeof data === 'object' && data.type === 'file') {
            if (!settings.allowFiles.checked) {
                log(`Rejected file: ${data.name} (File transfers disabled)`);
                return;
            }
            const folder = settings.saveFolder.value.trim();
            if (window.AndroidBridge) {
                window.AndroidBridge.saveReceivedFile(data.name, data.data, folder);
            }
            addMessage(`Received: ${data.name}` + (folder ? ` -> Downloads/${folder}` : ''), 'system');
        }
    }

    function handleReceivedVoiceNote(msg) {
        const audio = new Audio('data:' + (msg.mimeType || 'audio/webm') + ';base64,' + msg.data);
        audio.oncanplaythrough = () => {
            audio.play().catch(e => log(`Voice note play error: ${e.message}`, true));
        };
        const dur = msg.duration ? formatDuration(msg.duration) : '?';
        addMessage(`Voice note (${dur})`, 'received');
        const msgDiv = elements.chatMessages.lastElementChild;
        if (msgDiv) {
            const playBtn = document.createElement('button');
            playBtn.textContent = 'Play';
            playBtn.className = 'play-voice-btn';
            playBtn.onclick = () => {
                audio.currentTime = 0;
                audio.play().catch(e => log(`Voice note play error: ${e.message}`, true));
            };
            msgDiv.appendChild(playBtn);
        }
    }

    function addMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message message-${type}`;
        msgDiv.textContent = text;
        elements.chatMessages.appendChild(msgDiv);
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function updateStatus(text, className) {
        elements.status.textContent = text;
        elements.status.className = className;
    }

    function showChat() {
        elements.chatSection.classList.remove('hidden');
        elements.idSection.classList.add('hidden');
        elements.connectSection.classList.add('hidden');
        elements.randomSection.classList.add('hidden');
    }

    function hideChat() {
        elements.chatSection.classList.add('hidden');
        elements.idSection.classList.remove('hidden');
        elements.connectSection.classList.remove('hidden');
        elements.randomSection.classList.remove('hidden');
    }

    function connectToPeer(id) {
        if (!id) return;
        updateStatus(`Connecting...`, 'status-connecting');
        setupConnection(peer.connect(id, { reliable: true }));
    }

    function handleNudge() {
        document.body.classList.add('shake');
        if (settings.vibrate.checked && window.AndroidBridge) window.AndroidBridge.vibrate(500);
        addMessage('Nudge received!', 'system');
        setTimeout(() => document.body.classList.remove('shake'), 500);
    }

    function getLobbyId() {
        const slot = Math.floor(Date.now() / (LOBBY_SLOT_SECS * 1000));
        return LOBBY_PREFIX + slot;
    }

    function startRandomSearch() {
        if (!localId) {
            log('No local ID yet, wait for peer initialization', true);
            return;
        }
        if (isSearching) return;
        if (conn && conn.open) {
            log('Already connected to a peer', true);
            return;
        }
        isSearching = true;
        searchRetryCount = 0;
        updateSearchUI(true);
        joinLobby();
    }

    function cancelRandomSearch() {
        if (!isSearching) return;
        isSearching = false;
        clearTimeout(searchRetryTimer);
        searchRetryTimer = null;
        searchRetryCount = 0;
        updateSearchUI(false);
        leaveLobby();
    }

    function updateSearchUI(searching) {
        if (searching) {
            elements.searchStatus.classList.remove('hidden');
            elements.searchStatusText.textContent = 'Searching for a random user...';
            elements.connectRandomBtn.classList.add('hidden');
            elements.cancelSearchBtn.classList.remove('hidden');
        } else {
            elements.searchStatus.classList.add('hidden');
            elements.connectRandomBtn.classList.remove('hidden');
            elements.cancelSearchBtn.classList.add('hidden');
        }
    }

    function joinLobby() {
        if (!isSearching) return;
        const lobbyId = getLobbyId();
        log(`Joining lobby: ${lobbyId}`);
        if (lobbyPeer) { lobbyPeer.destroy(); lobbyPeer = null; }
        lobbyConn = null;
        lobbyQueue = [];
        const iceServers = buildIceServers();
        lobbyPeer = new Peer(lobbyId, {
            config: { iceServers: iceServers, iceTransportPolicy: 'all' },
            debug: 0
        });
        lobbyPeer.on('open', () => {
            log(`Became lobby host: ${lobbyId}`);
            elements.searchStatusText.textContent = 'Hosting lobby, waiting for users...';
            lobbyQueue.push({
                conn: null,
                peerId: localId,
                persistentId: persistentId,
                isHost: true
            });
            lobbyPeer.on('connection', (conn) => {
                handleLobbyConnection(conn);
            });
        });
        lobbyPeer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                log(`Lobby ${lobbyId} already has a host, connecting as client`);
                lobbyPeer.destroy();
                lobbyPeer = null;
                connectToLobbyHost(lobbyId);
            } else {
                log(`Lobby error: ${err.type}`, true);
                lobbyPeer.destroy();
                lobbyPeer = null;
                if (isSearching) scheduleLobbyRetry();
            }
        });
    }

    let lobbyQueue = [];

    function handleLobbyConnection(conn) {
        conn.on('open', () => {
            conn.on('data', (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (msg.type === 'lobby_join') {
                        const clientPeerId = msg.peerId;
                        const clientPersistentId = msg.persistentId;
                        if (blockedPeers.has(clientPersistentId)) {
                            conn.send(JSON.stringify({ type: 'lobby_reject', reason: 'blocked' }));
                            conn.close();
                            return;
                        }
                        lobbyQueue.push({ conn: conn, peerId: clientPeerId, persistentId: clientPersistentId });
                        log(`Lobby client joined: ${clientPeerId}`);
                        tryPairLobbyClients();
                    }
                } catch (e) {}
            });
            conn.on('close', () => {
                lobbyQueue = lobbyQueue.filter(q => q.conn !== conn);
            });
        });
    }

    function tryPairLobbyClients() {
        while (lobbyQueue.length >= 2) {
            const a = lobbyQueue.shift();
            const b = lobbyQueue.shift();
            if (skippedPeers.has(b.persistentId) && !skippedPeers.has(a.persistentId)) {
                lobbyQueue.unshift(b);
                continue;
            }
            if (skippedPeers.has(a.persistentId) && !skippedPeers.has(b.persistentId)) {
                lobbyQueue.unshift(a);
                continue;
            }
            if (a.isHost) {
                b.conn.send(JSON.stringify({ type: 'lobby_paired', peerId: a.peerId }));
                setTimeout(() => { try { b.conn.close(); } catch(e) {} }, 500);
                isSearching = false;
                updateSearchUI(false);
                leaveLobby();
                connectToPeer(b.peerId);
                log(`Host paired with client: ${a.peerId} <-> ${b.peerId}`);
            } else if (b.isHost) {
                a.conn.send(JSON.stringify({ type: 'lobby_paired', peerId: b.peerId }));
                setTimeout(() => { try { a.conn.close(); } catch(e) {} }, 500);
                isSearching = false;
                updateSearchUI(false);
                leaveLobby();
                connectToPeer(a.peerId);
                log(`Host paired with client: ${b.peerId} <-> ${a.peerId}`);
            } else {
                a.conn.send(JSON.stringify({ type: 'lobby_paired', peerId: b.peerId }));
                b.conn.send(JSON.stringify({ type: 'lobby_paired', peerId: a.peerId }));
                setTimeout(() => { try { a.conn.close(); } catch(e) {} }, 500);
                setTimeout(() => { try { b.conn.close(); } catch(e) {} }, 500);
                log(`Paired: ${a.peerId} <-> ${b.peerId}`);
            }
        }
    }

    function connectToLobbyHost(lobbyId) {
        if (!isSearching) return;
        log(`Connecting to lobby host: ${lobbyId}`);
        const conn = peer.connect(lobbyId, { reliable: true });
        conn.on('open', () => {
            lobbyConn = conn;
            conn.send(JSON.stringify({
                type: 'lobby_join',
                peerId: localId,
                persistentId: persistentId
            }));
            elements.searchStatusText.textContent = 'Waiting in lobby for a match...';
        });
        conn.on('data', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'lobby_paired') {
                    log(`Lobby matched with: ${msg.peerId}`);
                    isSearching = false;
                    updateSearchUI(false);
                    leaveLobby();
                    connectToPeer(msg.peerId);
                } else if (msg.type === 'lobby_reject') {
                    log(`Lobby rejected: ${msg.reason}`, true);
                    leaveLobby();
                    if (isSearching) scheduleLobbyRetry();
                }
            } catch (e) {}
        });
        conn.on('close', () => {
            lobbyConn = null;
            if (isSearching) scheduleLobbyRetry();
        });
        conn.on('error', () => {
            lobbyConn = null;
            if (isSearching) scheduleLobbyRetry();
        });
    }

    function leaveLobby() {
        if (lobbyConn) { try { lobbyConn.close(); } catch(e) {} lobbyConn = null; }
        if (lobbyPeer) { try { lobbyPeer.destroy(); } catch(e) {} lobbyPeer = null; }
        lobbyQueue = [];
    }

    function scheduleLobbyRetry() {
        if (!isSearching) return;
        searchRetryCount++;
        const delay = Math.min(searchRetryCount * 2000, 15000);
        elements.searchStatusText.textContent = `Searching... (retry ${searchRetryCount})`;
        log(`Lobby retry in ${delay/1000}s (attempt ${searchRetryCount})`);
        clearTimeout(searchRetryTimer);
        searchRetryTimer = setTimeout(() => {
            if (isSearching) joinLobby();
        }, delay);
    }

    function blockCurrentPeer() {
        if (!remotePeerId) return;
        if (isInCall) endCall();
        if (persistentId) blockedPeers.add(persistentId);
        blockedPeers.add(remotePeerId);
        saveBlockedPeers();
        if (conn) {
            isUserEndingChat = true;
            conn.close();
        }
        addMessage(`System: Blocked ${remotePeerId}`, 'system');
        hideChat();
        conn = null;
        remotePeerId = null;
        startRandomSearch();
    }

    function skipCurrentPeer() {
        if (!remotePeerId) return;
        if (isInCall) endCall();
        skippedPeers.add(remotePeerId);
        if (conn) {
            isUserEndingChat = true;
            conn.close();
        }
        addMessage(`System: Skipped ${remotePeerId}`, 'system');
        hideChat();
        conn = null;
        remotePeerId = null;
        startRandomSearch();
    }

    function endCurrentChat() {
        if (!remotePeerId) return;
        if (isInCall) endCall();
        if (conn) {
            isUserEndingChat = true;
            conn.close();
        }
        hideChat();
        conn = null;
        remotePeerId = null;
    }

    function addKnownPeer(peerId) {
        if (!peerId) return;
        knownPeers.set(peerId, new Date().toISOString());
        saveKnownPeers();
    }

    function showBlockedModal() {
        elements.blockedList.innerHTML = '';
        if (blockedPeers.size === 0) {
            elements.blockedList.innerHTML = '<p class="empty-list">No blocked users</p>';
        } else {
            for (const id of blockedPeers) {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `<span class="list-item-id">${id}</span>`;
                const unblockBtn = document.createElement('button');
                unblockBtn.className = 'small-btn secondary-btn';
                unblockBtn.textContent = 'Unblock';
                unblockBtn.onclick = () => {
                    blockedPeers.delete(id);
                    saveBlockedPeers();
                    showBlockedModal();
                };
                item.appendChild(unblockBtn);
                elements.blockedList.appendChild(item);
            }
        }
        elements.blockedModal.classList.remove('hidden');
    }

    function showKnownModal() {
        elements.knownList.innerHTML = '';
        if (knownPeers.size === 0) {
            elements.knownList.innerHTML = '<p class="empty-list">No known users yet</p>';
        } else {
            const entries = [...knownPeers.entries()].sort((a, b) => b[1].localeCompare(a[1]));
            for (const [id, time] of entries) {
                const item = document.createElement('div');
                item.className = 'list-item';
                const date = new Date(time).toLocaleDateString();
                item.innerHTML = `<span class="list-item-id">${id}</span><span class="list-item-time">${date}</span>`;
                const connectBtn = document.createElement('button');
                connectBtn.className = 'small-btn primary-btn';
                connectBtn.textContent = 'Connect';
                connectBtn.onclick = () => {
                    elements.knownModal.classList.add('hidden');
                    connectToPeer(id);
                };
                item.appendChild(connectBtn);
                elements.knownList.appendChild(item);
            }
        }
        elements.knownModal.classList.remove('hidden');
    }

    function startVoiceNote() {
        if (!conn || !conn.open) return;
        if (voiceNoteRecorder && voiceNoteRecorder.state === 'recording') return;
        requestAudioPermission(() => {
            doStartVoiceNote();
        });
    }

    function doStartVoiceNote() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            voiceNoteChunks = [];
            voiceNoteSeconds = 0;
            try {
                voiceNoteRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            } catch (e) {
                voiceNoteRecorder = new MediaRecorder(stream);
            }
            voiceNoteRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) voiceNoteChunks.push(e.data);
            };
            voiceNoteRecorder.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const blob = new Blob(voiceNoteChunks, { type: voiceNoteRecorder.mimeType || 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1];
                    if (conn && conn.open) {
                        conn.send(JSON.stringify({ type: 'voice_note', data: base64, mimeType: blob.type, duration: voiceNoteSeconds }));
                        addMessage(`Voice note (${formatDuration(voiceNoteSeconds)})`, 'sent');
                    }
                };
                reader.readAsDataURL(blob);
            };
            voiceNoteRecorder.start(100);
            elements.voiceNoteIndicator.classList.remove('hidden');
            updateVoiceNoteTimer();
            voiceNoteTimer = setInterval(updateVoiceNoteTimer, 1000);
            log('Voice note recording started');
        }).catch(err => {
            log(`Voice note error: ${err.message}`, true);
        });
    }

    function stopVoiceNote() {
        if (!voiceNoteRecorder || voiceNoteRecorder.state !== 'recording') return;
        voiceNoteRecorder.stop();
        voiceNoteRecorder = null;
        clearInterval(voiceNoteTimer);
        voiceNoteTimer = null;
        elements.voiceNoteIndicator.classList.add('hidden');
        log('Voice note recording stopped');
    }

    function updateVoiceNoteTimer() {
        voiceNoteSeconds++;
        elements.voiceNoteTimer.textContent = formatDuration(voiceNoteSeconds);
    }

    function formatDuration(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function startCall(withVideo) {
        if (!conn || !conn.open || isInCall) {
            log(`Call blocked: conn=${!!conn} open=${conn&&conn.open} inCall=${isInCall}`, true);
            return;
        }
        isInCall = true;
        isCallInitiator = true;
        const needsCamera = withVideo;
        requestAudioPermission(() => {
            if (needsCamera) {
                requestCameraPermission(() => {
                    doStartCall(withVideo);
                }, () => {
                    isInCall = false;
                    isCallInitiator = false;
                });
            } else {
                doStartCall(withVideo);
            }
        }, () => {
            isInCall = false;
            isCallInitiator = false;
        });
    }

    function doStartCall(withVideo) {
        const constraints = withVideo
            ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
            : { audio: true, video: false };
        log(`Starting ${withVideo?'video':'voice'} call to ${remotePeerId}`);
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            localStream = stream;
            elements.localVideo.srcObject = stream;
            if (!withVideo) elements.localVideo.classList.add('hidden');
            else elements.localVideo.classList.remove('hidden');
            elements.callOverlay.classList.remove('hidden');
            elements.callStatusText.textContent = 'Calling...';
            elements.toggleCamBtn.classList.toggle('hidden', !withVideo);
            const callOpts = withVideo ? { metadata: { video: true } } : {};
            mediaCall = peer.call(remotePeerId, stream, callOpts);
            log(`Call initiated, waiting for answer`);
            setupMediaCall(mediaCall);
        }).catch(err => {
            log(`Call media error: ${err.message}`, true);
            isInCall = false;
            isCallInitiator = false;
        });
    }

    function setupMediaCall(call) {
        call.on('stream', (remoteStream) => {
            log('Remote stream received');
            elements.remoteVideo.srcObject = remoteStream;
            elements.callStatusText.textContent = 'Connected';
        });
        call.on('close', () => {
            log('Call closed by remote');
            endCall();
        });
        call.on('error', (err) => {
            log(`Call error: ${err.message || err}`, true);
            endCall();
        });
    }

    function answerIncomingCall(call) {
        log(`Incoming call from ${call.peer}, metadata: ${JSON.stringify(call.metadata)}`);
        if (isInCall) { call.close(); return; }
        isInCall = true;
        isCallInitiator = false;
        const isVideo = call.metadata && call.metadata.video;
        const constraints = isVideo
            ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
            : { audio: true, video: false };
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            localStream = stream;
            elements.localVideo.srcObject = stream;
            if (!isVideo) elements.localVideo.classList.add('hidden');
            else elements.localVideo.classList.remove('hidden');
            elements.callOverlay.classList.remove('hidden');
            elements.callStatusText.textContent = 'Connected';
            elements.toggleCamBtn.classList.toggle('hidden', !isVideo);
            call.answer(stream);
            log(`Answered ${isVideo?'video':'voice'} call`);
            setupMediaCall(call);
        }).catch(err => {
            log(`Answer call media error: ${err.message}`, true);
            call.close();
            isInCall = false;
        });
    }

    function endCall() {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        if (mediaCall) {
            mediaCall.close();
            mediaCall = null;
        }
        elements.remoteVideo.srcObject = null;
        elements.localVideo.srcObject = null;
        elements.callOverlay.classList.add('hidden');
        isInCall = false;
        isCallInitiator = false;
        log('Call ended');
    }

    function toggleMic() {
        if (!localStream) return;
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            elements.toggleMicBtn.classList.toggle('active', audioTrack.enabled);
            elements.toggleMicBtn.textContent = audioTrack.enabled ? 'Mic' : 'Muted';
        }
    }

    function toggleCam() {
        if (!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            elements.toggleCamBtn.classList.toggle('active', videoTrack.enabled);
            elements.toggleCamBtn.textContent = videoTrack.enabled ? 'Cam' : 'Cam Off';
        }
    }

    function toggleSpeaker() {
        if (!elements.remoteVideo) return;
        const isSpeaker = elements.remoteVideo.audioOutputType !== 'speaker';
        if (typeof elements.remoteVideo.setSinkId === 'function') {
            elements.remoteVideo.setSinkId(isSpeaker ? 'speaker' : '').catch(() => {});
        }
        elements.toggleSpeakerBtn.classList.toggle('active', isSpeaker);
        elements.toggleSpeakerBtn.textContent = isSpeaker ? 'Spkr' : 'Earpc';
    }

    let pendingAudioCallback = null;
    let pendingCameraCallback = null;
    let pendingAudioFailCallback = null;
    let pendingCameraFailCallback = null;

    function requestAudioPermission(onGranted, onDenied) {
        if (window.AndroidBridge) {
            pendingAudioCallback = onGranted;
            pendingAudioFailCallback = onDenied || (() => {});
            window.AndroidBridge.requestAudioPermission();
        } else {
            onGranted();
        }
    }

    function requestCameraPermission(onGranted, onDenied) {
        if (window.AndroidBridge) {
            pendingCameraCallback = onGranted;
            pendingCameraFailCallback = onDenied || (() => {});
            window.AndroidBridge.requestCameraPermission();
        } else {
            onGranted();
        }
    }

    window.onAudioPermissionResult = (granted) => {
        if (granted) {
            if (pendingAudioCallback) { pendingAudioCallback(); pendingAudioCallback = null; }
        } else {
            log('Audio permission denied', true);
            if (pendingAudioFailCallback) { pendingAudioFailCallback(); pendingAudioFailCallback = null; }
        }
    };

    window.onCameraPermissionResult = (granted) => {
        if (granted) {
            if (pendingCameraCallback) { pendingCameraCallback(); pendingCameraCallback = null; }
        } else {
            log('Camera permission denied', true);
            if (pendingCameraFailCallback) { pendingCameraFailCallback(); pendingCameraFailCallback = null; }
        }
    };

    window.isModalOpen = () => {
        return (!elements.settingsModal.classList.contains('hidden') ||
                !elements.blockedModal.classList.contains('hidden') ||
                !elements.knownModal.classList.contains('hidden')).toString();
    };

    window.closeTopModal = () => {
        if (!elements.settingsModal.classList.contains('hidden')) {
            elements.settingsModal.classList.add('hidden');
        } else if (!elements.blockedModal.classList.contains('hidden')) {
            elements.blockedModal.classList.add('hidden');
        } else if (!elements.knownModal.classList.contains('hidden')) {
            elements.knownModal.classList.add('hidden');
        }
    };

    window.onQrScanResult = (res) => { elements.remoteIdInput.value = res; connectToPeer(res); };
    window.onFilePicked = (file) => {
        if (file && conn && conn.open) {
            conn.send({ type: 'file', name: file.name, size: file.size, data: file.data });
            addMessage(`Sent: ${file.name}`, 'system');
        }
    };
    window.onFileSaved = (path) => {
        const folder = settings.saveFolder.value.trim();
        if (folder) {
            addMessage(`Saved to Downloads/${folder}`, 'system');
        } else {
            addMessage('Saved to Downloads', 'system');
        }
    };

    elements.connectBtn.addEventListener('click', () => connectToPeer(elements.remoteIdInput.value.trim()));
    elements.sendBtn.addEventListener('click', () => {
        const text = elements.messageInput.value.trim();
        if (text && conn && conn.open) {
            conn.send(JSON.stringify({ type: 'chat', text }));
            addMessage(text, 'sent');
            elements.messageInput.value = '';
        }
    });
    elements.endChatBtn.addEventListener('click', endCurrentChat);
    elements.blockBtn.addEventListener('click', blockCurrentPeer);
    elements.skipBtn.addEventListener('click', skipCurrentPeer);
    elements.connectRandomBtn.addEventListener('click', startRandomSearch);
    elements.cancelSearchBtn.addEventListener('click', cancelRandomSearch);
    elements.showBlockedBtn.addEventListener('click', showBlockedModal);
    elements.closeBlockedBtn.addEventListener('click', () => elements.blockedModal.classList.add('hidden'));
    elements.showKnownBtn.addEventListener('click', showKnownModal);
    elements.closeKnownBtn.addEventListener('click', () => elements.knownModal.classList.add('hidden'));

    function onSettingChange() { saveSettings(); }
    settings.autoReconnect.addEventListener('change', onSettingChange);
    settings.screenOn.addEventListener('change', () => { applyScreenSetting(); saveSettings(); });
    settings.allowFiles.addEventListener('change', onSettingChange);
    settings.vibrate.addEventListener('change', onSettingChange);
    settings.debug.addEventListener('change', onSettingChange);
    settings.saveFolder.addEventListener('change', onSettingChange);
    settings.ipv4.addEventListener('change', () => { saveSettings(); initPeer(); });
    settings.ipv6.addEventListener('change', () => { saveSettings(); initPeer(); });
    settings.tcp.addEventListener('change', () => { saveSettings(); initPeer(); });
    settings.udp.addEventListener('change', () => { saveSettings(); initPeer(); });
    settings.proxyUrl.addEventListener('change', () => { saveSettings(); initPeer(); });

    elements.openSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
    elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.newIdBtn.addEventListener('click', initPeer);
    elements.scanQrBtn.addEventListener('click', () => window.AndroidBridge && window.AndroidBridge.scanQrCode());
    elements.copyIdBtn.addEventListener('click', () => {
        if (localId) {
            if (window.AndroidBridge) window.AndroidBridge.copyToClipboard(localId);
            elements.copyIdBtn.textContent = 'Copied';
            setTimeout(() => elements.copyIdBtn.textContent = 'Copy', 2000);
        }
    });
    elements.pickFileBtn.addEventListener('click', () => window.AndroidBridge && window.AndroidBridge.pickFile());
    elements.nudgeBtn.addEventListener('click', () => {
        if (conn && conn.open) {
            conn.send(JSON.stringify({ type: 'nudge' }));
            addMessage('Nudge sent!', 'system');
        }
    });
    elements.checkUpdateBtn.addEventListener('click', () => {
        if (window.AndroidBridge) {
            window.AndroidBridge.openUrl(GITHUB_REPO_URL);
        } else {
            window.open(GITHUB_REPO_URL, '_blank');
        }
    });
    elements.shareAppBtn.addEventListener('click', () => window.AndroidBridge && window.AndroidBridge.shareApp(GITHUB_REPO_URL));

    elements.voiceNoteBtn.addEventListener('mousedown', startVoiceNote);
    elements.voiceNoteBtn.addEventListener('mouseup', stopVoiceNote);
    elements.voiceNoteBtn.addEventListener('mouseleave', stopVoiceNote);
    elements.voiceNoteBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startVoiceNote(); });
    elements.voiceNoteBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopVoiceNote(); });
    elements.voiceNoteBtn.addEventListener('touchcancel', stopVoiceNote);

    elements.voiceCallBtn.addEventListener('click', () => startCall(false));
    elements.videoCallBtn.addEventListener('click', () => startCall(true));
    elements.hangupBtn.addEventListener('click', endCall);
    elements.toggleMicBtn.addEventListener('click', toggleMic);
    elements.toggleCamBtn.addEventListener('click', toggleCam);
    elements.toggleSpeakerBtn.addEventListener('click', toggleSpeaker);

    settings.useTurn.addEventListener('change', initPeer);
    settings.screenOn.addEventListener('change', applyScreenSetting);

    loadSettings();
    loadBlockedPeers();
    loadKnownPeers();
    detectNetwork();
    if (window.AndroidBridge) {
        persistentId = window.AndroidBridge.getPersistentId();
    }
    initPeer();
    applyScreenSetting();
})();
