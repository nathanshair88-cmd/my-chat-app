# Alto

A community app for conversations, voice rooms, video, watch parties, and direct file sharing. The frontend uses React 19 and Vite; the backend is FastAPI, Socket.IO, SQLAlchemy, and WebRTC signalling.

## Run locally

From the repository root, install the frontend and backend dependencies:

```powershell
npm --prefix frontend ci
python -m pip install -r backend/requirements.txt
```

Start the backend in one terminal:

```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend from the repository root in another:

```powershell
npm run dev
```

Open http://localhost:5173. Create an account or sign in to your existing local account. The default backend database is `backend/discoalto_clone.db`; existing storage keys and database identities are preserved.

If using a different frontend port, add its exact origin to `CORS_ORIGINS` and `SOCKET_CORS_ORIGINS` when starting the backend. Set `VITE_API_URL` and `VITE_SOCKET_URL` for a separately hosted backend. Existing deployment configuration remains in the repository's hosting guides. The production backend must supply its own authentication secret and allowed origins.

## Product and design

### Navigation update

Spaces and channels now share one labeled sidebar. Selecting a space opens its last visited channel; selecting an open space collapses or expands its channel list. On phones, Browse opens the same navigation as a keyboard-contained drawer, with the full screen available for the conversation.

Messages opens an inbox with conversation search, All/Unread filters, and a New message action. Friends and requests remain separate. Chats include a Back to messages button and an explicit profile action. Member lists and voice text panels open on demand. Voice rooms preview consistently on desktop and mobile, and require an explicit Join Voice action. Call controls now have visible labels.

Home puts shortcuts and spaces first for existing members. Message formatting expands on demand, while mobile message actions use one labeled menu. Account controls remain in a single dock. The navigation regression test covers these flows, remembered channels, and mobile focus restoration.

- Original Alto brand mark, geometric artwork, and five bundled SVG avatars. These assets do not need external image services.
- A home dashboard using real spaces, conversations, friends, and saved-message counts.
- A single account dock across home, spaces, and DMs. Profile/status, mute, deafen, and settings live here; an active call adds camera, screen sharing, room navigation, and disconnect controls.
- Dark, light, and AMOLED palettes, adaptive navigation, visible keyboard focus, reduced-motion support, and keyboard-contained dialogs.
- Ctrl+K / Cmd+K jumps to spaces, channels, conversations, saved messages, and settings. Arrow keys select a result; Enter opens it; Escape closes the palette.
- Saved messages can be searched and removed. They are local snapshots, scoped to the signed-in account and stored in this browser, not synced to other devices.
- Text drafts persist per account, conversation, and thread in this browser. Files are not persisted in drafts. Clearing browser storage removes local drafts and saved messages.
- Channel history opens at the latest 50 messages; Load earlier messages pages backward. The chat search filters the loaded messages.
- Existing friends, DMs/read receipts, channel reactions, replies/threads, Markdown, attachments/GIFs, server roles, webhooks, voice/video, screen sharing, watch parties, and direct file-transfer implementations remain available.

## Reliability improvements

Conversation fetches ignore stale responses after navigation. Outages offer retry without discarding a valid saved session. Message edits wait for a server acknowledgement. Chat does not force-scroll while reading earlier messages. Friend notifications serialize dates correctly. Threads no longer duplicate their replies into the main conversation.

Opening settings does not automatically request a microphone or camera. Leaving voice releases microphone, camera, screen, and composite tracks. Logout cancels file transfers and resets their session state. Socket authentication uses its auth payload instead of exposing the token in the URL. Server exception details are off by default. Axios is updated to a patched compatible release.

Voice, video, transfers, and Markdown load separately to reduce the initial JavaScript bundle. API requests have a timeout; recoverable loading failures and render failures have useful fallback screens.

## Checks and visual evidence

From the repository root:

```powershell
npm run build
npm run lint
npm run test:e2e
```

The browser tests use installed Google Chrome, ports 5175/8001, and the separate `backend/alto-e2e.db` database. They do not use your existing application database. Voice tests use synthetic devices, not your real microphone or camera. Close any previous test processes on these ports before rerunning.

The suite covers registration/login, spaces/invites, two-user friends and DMs, file transfer, drafts, saved messages, edit acknowledgements, channel history, reactions, threads, attachments, themes, network recovery, and the unified voice dock. Screenshot evidence is generated in `frontend/tests/evidence/`, and the HTML report in `frontend/playwright-report/`. Both are ignored by Git. Responsive evidence includes 360x640, 390x844, 768x1024, 1440x1000, 1920x1080, and 1440x3088, with live viewport changes.

These local checks do not establish real-device audio quality, internet-scale TURN reliability, or external YouTube playback across devices. Validate those with two physical devices on different networks before a public production release. No production deployment is performed by the local test suite.
