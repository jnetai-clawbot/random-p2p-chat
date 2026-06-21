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

    let peer = null;
    let conn = null;
    let localId = null;
    let qrCode = null;
    let remotePeerId = null;
    let isUserEndingChat = false;
    let matchSocket = null;
    let isSearching = false;
    let blockedPeers = new Set();
    let skippedPeers = new Set();
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
        voiceNoteTimer: document.getElementById('voice-note-timer')
    };

    const settings = {
        autoReconnect: document.getElementById('setting-auto-reconnect'),
        screenOn: document.getElementById('setting-screen-on'),
        allowFiles: document.getElementById('setting-allow-files'),
        saveFolder: document.getElementById('setting-save-folder'),
        vibrate: document.getElementById('setting-vibrate'),
        useTurn: document.getElementById('setting-use-turn'),
        debug: document.getElementById('setting-debug')
    };

    const GITHUB_REPO_URL = 'https://github.com/jnetai-clawbot/random-p2p-chat/releases';
    const MATCHMAKING_SERVER = 'wss://random-p2p-chat-server.glitch.me';

    const SETTINGS_KEY = 'p2pchat_settings';

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
                saveFolder: settings.saveFolder.value
            }));
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
        elements.webrtcSupport.textContent = (window.RTCPeerConnection) ? "✅ Supported" : "❌ Not Supported";
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

    function initPeer() {
        if (peer) peer.destroy();
        const idToUse = generateRandomId();
        const iceServers = [...STUN_SERVERS];
        if (settings.useTurn.checked) iceServers.push(...TURN_SERVERS);
        
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
            addMessage(`Received: ${data.name}` + (folder ? ` → Downloads/${folder}` : ''), 'system');
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
            playBtn.textContent = '▶ Play';
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

    function connectMatchmaking() {
        if (matchSocket && matchSocket.readyState === WebSocket.OPEN) return;
        try {
            matchSocket = new WebSocket(MATCHMAKING_SERVER);
            matchSocket.onopen = () => {
                log('Matchmaking server connected');
                if (localId) matchSocket.send(JSON.stringify({ type: 'register', peerId: localId }));
            };
            matchSocket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    handleMatchMessage(msg);
                } catch (e) {
                    log(`Matchmaking parse error: ${e.message}`, true);
                }
            };
            matchSocket.onclose = () => {
                log('Matchmaking server disconnected');
                matchSocket = null;
                if (isSearching) {
                    isSearching = false;
                    updateSearchUI(false);
                    setTimeout(() => {
                        if (isSearching) connectMatchmaking();
                    }, 5000);
                }
            };
            matchSocket.onerror = (err) => {
                log('Matchmaking server error', true);
            };
        } catch (e) {
            log(`Matchmaking connection failed: ${e.message}`, true);
            matchSocket = null;
        }
    }

    function handleMatchMessage(msg) {
        switch (msg.type) {
            case 'registered':
                log('Registered with matchmaking server');
                break;
            case 'searching':
                log(`Searching for random user... (${msg.poolSize} users in pool)`);
                break;
            case 'matched':
                log(`Matched with random user: ${msg.peerId}`);
                isSearching = false;
                updateSearchUI(false);
                if (matchSocket && matchSocket.readyState === WebSocket.OPEN) {
                    matchSocket.send(JSON.stringify({ type: 'paired', peerId: msg.peerId }));
                }
                connectToPeer(msg.peerId);
                break;
            case 'search_cancelled':
                log('Search cancelled');
                break;
            case 'blocked':
                log(`Blocked user: ${msg.blockedPeerId}`);
                blockedPeers.add(msg.blockedPeerId);
                break;
            case 'skipped':
                log(`Skipped user: ${msg.skippedPeerId}`);
                skippedPeers.add(msg.skippedPeerId);
                break;
            case 'peer_disconnected':
                log(`Peer disconnected: ${msg.reason}`);
                if (conn) {
                    isUserEndingChat = true;
                    conn.close();
                }
                break;
            case 'peer_disconnected_ack':
                log('Peer disconnect acknowledged');
                break;
            case 'error':
                log(`Matchmaking error [${msg.code}]: ${msg.message}`, true);
                break;
        }
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
        updateSearchUI(true);
        connectMatchmaking();
        const tryRegister = () => {
            if (matchSocket && matchSocket.readyState === WebSocket.OPEN) {
                matchSocket.send(JSON.stringify({ type: 'register', peerId: localId }));
                matchSocket.send(JSON.stringify({ type: 'search' }));
            } else if (isSearching) {
                setTimeout(tryRegister, 1000);
            }
        };
        tryRegister();
    }

    function cancelRandomSearch() {
        if (!isSearching) return;
        isSearching = false;
        updateSearchUI(false);
        if (matchSocket && matchSocket.readyState === WebSocket.OPEN) {
            matchSocket.send(JSON.stringify({ type: 'cancel_search' }));
        }
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

    function blockCurrentPeer() {
        if (!remotePeerId) return;
        if (isInCall) endCall();
        blockedPeers.add(remotePeerId);
        if (matchSocket && matchSocket.readyState === WebSocket.OPEN) {
            matchSocket.send(JSON.stringify({ type: 'block', peerId: remotePeerId }));
        }
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
        if (matchSocket && matchSocket.readyState === WebSocket.OPEN) {
            matchSocket.send(JSON.stringify({ type: 'skip', peerId: remotePeerId }));
        }
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
        if (matchSocket && matchSocket.readyState === WebSocket.OPEN) {
            matchSocket.send(JSON.stringify({ type: 'disconnect_peer' }));
        }
        if (conn) {
            isUserEndingChat = true;
            conn.close();
        }
        hideChat();
        conn = null;
        remotePeerId = null;
    }

    function startVoiceNote() {
        if (!conn || !conn.open) return;
        if (voiceNoteRecorder && voiceNoteRecorder.state === 'recording') return;
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
        if (!conn || !conn.open || isInCall) return;
        isInCall = true;
        isCallInitiator = true;
        const constraints = withVideo
            ? { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }
            : { audio: true, video: false };
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            localStream = stream;
            elements.localVideo.srcObject = stream;
            if (!withVideo) elements.localVideo.classList.add('hidden');
            else elements.localVideo.classList.remove('hidden');
            elements.callOverlay.classList.remove('hidden');
            elements.callStatusText.textContent = 'Calling...';
            elements.toggleCamBtn.classList.toggle('hidden', !withVideo);
            mediaCall = peer.call(remotePeerId, stream);
            setupMediaCall(mediaCall);
        }).catch(err => {
            log(`Call error: ${err.message}`, true);
            isInCall = false;
            isCallInitiator = false;
        });
    }

    function setupMediaCall(call) {
        call.on('stream', (remoteStream) => {
            elements.remoteVideo.srcObject = remoteStream;
            elements.callStatusText.textContent = 'Connected';
            log('Call connected');
        });
        call.on('close', () => {
            endCall();
        });
        call.on('error', (err) => {
            log(`Call error: ${err.message}`, true);
            endCall();
        });
    }

    function answerIncomingCall(call) {
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
            setupMediaCall(call);
        }).catch(err => {
            log(`Answer call error: ${err.message}`, true);
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
            elements.toggleMicBtn.textContent = audioTrack.enabled ? '🎤' : '🔇';
        }
    }

    function toggleCam() {
        if (!localStream) return;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            elements.toggleCamBtn.classList.toggle('active', videoTrack.enabled);
            elements.toggleCamBtn.textContent = videoTrack.enabled ? '📷' : '📸';
        }
    }

    function toggleSpeaker() {
        if (!elements.remoteVideo) return;
        const isSpeaker = elements.remoteVideo.audioOutputType !== 'speaker';
        if (typeof elements.remoteVideo.setSinkId === 'function') {
            elements.remoteVideo.setSinkId(isSpeaker ? 'speaker' : '').catch(() => {});
        }
        elements.toggleSpeakerBtn.classList.toggle('active', isSpeaker);
        elements.toggleSpeakerBtn.textContent = isSpeaker ? '🔊' : '🔈';
    }

    // Bridge hooks
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

    // UI Events
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

    // Save settings on any setting change
    function onSettingChange() { saveSettings(); }
    settings.autoReconnect.addEventListener('change', onSettingChange);
    settings.screenOn.addEventListener('change', () => { applyScreenSetting(); saveSettings(); });
    settings.allowFiles.addEventListener('change', onSettingChange);
    settings.vibrate.addEventListener('change', onSettingChange);
    settings.debug.addEventListener('change', onSettingChange);
    settings.saveFolder.addEventListener('change', onSettingChange);

    elements.openSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
    elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.newIdBtn.addEventListener('click', initPeer);
    elements.scanQrBtn.addEventListener('click', () => window.AndroidBridge && window.AndroidBridge.scanQrCode());
    elements.copyIdBtn.addEventListener('click', () => {
        if (localId) {
            if (window.AndroidBridge) window.AndroidBridge.copyToClipboard(localId);
            elements.copyIdBtn.textContent = '✅';
            setTimeout(() => elements.copyIdBtn.textContent = '📋', 2000);
        }
    });
    elements.pickFileBtn.addEventListener('click', () => window.AndroidBridge && window.AndroidBridge.pickFile());
    elements.nudgeBtn.addEventListener('click', () => {
        if (conn && conn.open) {
            conn.send(JSON.stringify({ type: 'nudge' }));
            addMessage('Nudge sent!', 'system');
        }
    });
    elements.checkUpdateBtn.addEventListener('click', () => window.open(GITHUB_REPO_URL, '_blank'));
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
    detectNetwork();
    initPeer();
    applyScreenSetting(); // Default is ON
})();
