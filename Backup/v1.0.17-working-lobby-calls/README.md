# v1.0.17 - Working Lobby & Calls
## Status: WORKING (best known version)

### What Works
- Manual pairing via QR code / peer ID - connects reliably
- Random user pairing via lobby rendezvous - auto-pairs host+client
- Voice calls - full duplex audio
- Video calls - full duplex audio+video with front camera
- Voice notes - hold mic to record, release to send
- Peer ID auto-generates on app start with QR code
- Blocked/Known users modals
- Network settings: IPv4/IPv6/TCP/UDP/proxy TURN
- Back button closes modals instead of exiting
- Scrollable settings modal
- Runtime permissions for mic/camera

### What Doesn't Work
- No Accept/Decline incoming call dialog (auto-answers)
- No Reuse Last ID setting
- No Auto Answer Calls toggle
- No Auto Start on Boot
- No Reset All Settings button
- No QR code save to Downloads
- No Remove All Blocked/Known buttons
- No individual Remove per known user

### Files
- main.js (1057 lines)
- index.html (249 lines)
- style.css (500 lines)
- WebViewBridge.kt (228 lines)
- MainActivity.kt (274 lines)
