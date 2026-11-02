# Social Events — Backend

Express API for **Social Events**, a site where anyone can list their upcoming events (blood donation drives, tree plantations, community cleanups, …).

Serves the Next.js front end in [`../frontend`](../frontend).

## Stack

| | |
|---|---|
| Runtime | Node.js, ESM (`"type": "module"`) |
| Framework | Express `5.3` |
| Middleware | `cors` |
| Config | `dotenv` |
| Dev runner | `nodemon` |

## Getting Started

```bash
npm install
node index.js
```

The server listens on `http://localhost:8000` by default.

For auto-restart during development:

```bash
npx nodemon index.js
```

## Configuration

Configuration is loaded from `.env` via `dotenv/config`:

```bash
PORT=8000
```

`.env` is gitignored — never commit secrets or real environment values.

## Project Structure

```
backend/
├── index.js      # Express app + server bootstrap
├── package.json
└── .env          # local config (gitignored)
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Health check — returns `Hello World!` |

## Scripts

| Script | Description |
|---|---|
| `npm test` | Placeholder — no test runner configured yet |

## Notes for AI Agents

- Plain JavaScript, no build step. The server entry point is `backend/index.js`.
- ESM only — use `import`, not `require`.
- Don't read `backend/node_modules`.
