# v1.0.26 - Current Version
## Status: PARTIALLY WORKING

### What Works
- Manual pairing via QR code / peer ID - connects reliably
- Peer ID auto-generates on app start with QR code
- QR code tap/share saves to Downloads
- Blocked/Known users modals with Remove All + individual Remove
- Network settings: IPv4/IPv6/TCP/UDP/proxy TURN
- Back button closes modals instead of exiting
- Scrollable settings modal
- Runtime permissions for mic/camera
- Reuse Last ID setting
- Auto Answer Calls toggle (default ON)
- Auto Start on Boot setting
- Reset All Settings button
- Accept/Decline incoming call dialog (when auto-answer OFF)

### What Doesn't Work / Needs Testing
- Random user pairing - may fail to auto-connect (race condition fix applied)
- Voice/video calls - may fail after connection (300ms delay fix applied)
- Incoming call dialog - needs testing

### Files
- main.js (731 lines - compressed)
- index.html (285 lines)
- style.css (500 lines)
- WebViewBridge.kt (274 lines)
- MainActivity.kt (274 lines)
- build.gradle.kts
- AndroidManifest.xml
