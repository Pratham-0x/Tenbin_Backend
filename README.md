# Tenbin_Backend

A real-time multiplayer game server built with Express, Socket.io, and Node.js.

## Features

- Real-time player connections with Socket.io
- Multi-player game logic (2-5 players)
- Multi-player game room management
- Automatic scoring and winner calculation
- Live game state broadcasting
- Health check endpoint
- Production-ready CORS settings for frontend deployments

## Prerequisites

- Node.js >= 18.0.0
- npm

## Installation

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Server runs on http://localhost:3000

## Watch Mode

```bash
npm start
```

## Production

### Using PM2 (Recommended)

```bash
npm run prod
```

To restart or stop the app:

```bash
npm run prod:restart
npm run prod:stop
```

### Back4App Deployment

1. Create a `.env` file using `.env.example`.
2. Set the frontend origin to your deployed Vercel app:

```env
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://tenbin.vercel.app
```

3. Push this repository to GitHub.
4. Connect the repo in Back4App and deploy.
5. Keep the `Procfile` in the project root.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - `development` or `production`
- `CORS_ORIGIN` - Allowed frontend URL for Socket.io and HTTP requests

## Health Check

```bash
curl http://localhost:3000/health
```

Example response:

```json
{
  "ok": true,
  "status": "healthy",
  "environment": "development",
  "timestamp": "2026-10-08T17:00:00.000Z"
}
```

## Socket.io Events

### Client to Server

- `join`
- `start`
- `picked`
- `pick_time`
- `msg`
- `disconnect`

### Server to Client

- `lobby`
- `player_list`
- `host`
- `round_start`
- `start_timer`
- `player_picked`
- `end_picking`
- `result`
- `winner`
- `death`
- `notice`
- `game_end`

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN=https://tenbin.vercel.app`
- [ ] Ensure `.env` is ignored by Git
- [ ] Confirm the health route works
- [ ] Test Socket.io connection from the frontend
- [ ] Monitor logs in Back4App

## License

ISC
