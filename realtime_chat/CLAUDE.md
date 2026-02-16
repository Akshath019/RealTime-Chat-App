# Private Chat Application

## Overview
A real-time, private, self-destructing chat application built with Next.js, Upstash Redis, and Upstash Realtime. Rooms are temporary (10-minute TTL), support exactly 2 users, and messages are permanently deleted when the room is destroyed.

## Tech Stack
- **Framework:** Next.js 16.1.6 with App Router
- **Language:** TypeScript
- **API Layer:** Elysia (for type-safe API routes)
- **Database:** Upstash Redis (serverless Redis)
- **Real-time:** Upstash Realtime (WebSocket-based)
- **Deployment:** Vercel
- **State Management:** TanStack Query (React Query)

## Architecture

### Key Components

#### 1. Middleware (`src/middleware.ts`)
- Intercepts all `/room/:roomId` requests
- Validates room existence in Redis
- Blocks link preview bots (WhatsApp, Telegram, Discord, etc.) from consuming room slots
- Enforces 2-user capacity limit using atomic Redis operations
- Generates and manages `x-auth-token` cookies for authentication
- Uses Redis SET for atomic capacity checks (prevents race conditions)

#### 2. API Routes (`src/app/api/[[...slugs]]/route.ts`)
- **POST `/api/room/create`**: Creates new room with unique ID and 10-minute TTL
- **GET `/api/room/ttl`**: Returns remaining time before room expires
- **DELETE `/api/room`**: Destroys room and broadcasts destroy event
- **POST `/api/messages`**: Sends message to room, extends TTL
- **GET `/api/messages`**: Retrieves all messages in room

#### 3. Authentication (`src/app/api/[[...slugs]]/auth.ts`)
- Elysia middleware that validates:
  - `roomId` query parameter exists
  - `x-auth-token` cookie exists
  - Token is in the room's Redis SET (`connected:${roomId}`)
- Returns 401 Unauthorized if validation fails

#### 4. Real-time WebSocket (`src/app/api/realtime/route.ts`)
- WebSocket endpoint at `/api/realtime`
- Powered by Upstash Realtime
- Events:
  - `chat.message`: New message sent (triggers refetch)
  - `chat.destroy`: Room destroyed (redirects all users)

#### 5. Client Pages
- **Lobby (`src/app/page.tsx`)**: Create room, view error messages
- **Room (`src/app/room/[roomId]/page.tsx`)**: Chat interface with real-time updates

## Redis Data Structure

| Key Pattern | Type | Purpose | TTL |
|------------|------|---------|-----|
| `meta:{roomId}` | Hash | Room metadata (`createdAt`) | 600s (10 min) |
| `connected:{roomId}` | SET | User tokens (max 2 members) | Synced with room |
| `messages:{roomId}` | List | Message history | Synced with room |
| `history:{roomId}` | List | Backup message history | Synced with room |
| `{roomId}` | String | Realtime channel state | Synced with room |

## Important Implementation Details

### Bot Detection
The middleware detects and blocks link preview bots using User-Agent patterns:
- WhatsApp, Telegram, Discord, Slack
- Generic bots, crawlers, spiders
- Social media scrapers (Twitter, Facebook, LinkedIn)
- Prefetch requests

Bots can still access the page (for OpenGraph previews) but won't be added to the `connected` SET, preventing phantom users from consuming room capacity.

### Atomic Capacity Check
Uses Redis Lua script to atomically check capacity and add user:
```lua
local count = redis.call('SCARD', KEYS[1])
if count >= 2 then return 0 end
redis.call('SADD', KEYS[1], ARGV[1])
return 1
```
This prevents race conditions where multiple requests could add users simultaneously.

### Cookie Security
- `httpOnly: true`: Prevents XSS attacks
- `secure: true` (production): HTTPS only
- `sameSite: "lax"`: Allows cross-site navigation while preventing CSRF

### TTL Management
All Redis keys (room metadata, connected users, messages, realtime channel) share the same TTL. When messages are sent, all keys' TTLs are extended to match the room's remaining TTL.

## Common Issues & Solutions

### Issue: "Room Full" immediately after creation
**Cause:** Link preview bots (WhatsApp, Telegram) consuming room slots
**Solution:** Bot detection in middleware blocks bots from joining

### Issue: Race condition with multiple users joining simultaneously
**Cause:** Non-atomic capacity check
**Solution:** Lua script performs atomic SCARD + SADD operation

### Issue: Middleware not running
**Cause:** File must be named `src/middleware.ts` (not `proxy.ts`)
**Solution:** Next.js requires specific middleware filename convention

### Issue: Cookie not persisted across requests
**Cause:** `sameSite: "strict"` blocks cross-site cookies
**Solution:** Changed to `sameSite: "lax"` for better compatibility

## Environment Variables
```bash
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

## Development
```bash
npm install
npm run dev
```

## Deployment
- Push to GitHub triggers automatic Vercel deployment
- Middleware runs on Vercel Edge Functions
- Redis operations are serverless (Upstash)
- WebSocket connections use Upstash Realtime infrastructure

## Security Notes
- Tokens are httpOnly cookies (XSS protection)
- Room IDs use nanoid (collision-resistant)
- Messages auto-delete after 10 minutes
- No persistent storage of chat history
- Rate limiting handled by Upstash Redis
