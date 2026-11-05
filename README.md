# Kindred (Backend API)

REST API for **Kindred**, a community platform for organizing and joining local social-development drives.

- **Live API:** https://social-events-backend.vercel.app
- **Live site (frontend):** https://socialeventsfrontend.vercel.app

## Features

- CRUD for community events, with server-side validation of every field.
- Join and leave events, stored in a separate `joins` collection with a unique index per user and event.
- JWT-protected routes: tokens issued by the frontend (Better Auth) are verified with the frontend's public keys (JWKS).
- Ownership rules: only the organizer can update or delete an event. Identity is read from the verified token, never from the request body.
- Optional authentication on the event details route, so logged-in visitors also receive their own `joinedByMe` status.
- Recent-events endpoint for the home page, limited to six upcoming events.

## Tech Stack

Node.js, Express (ES modules), MongoDB (native driver), `jose` (JWT verification), `cors`, `dotenv`. Deployed on Vercel.

## Getting Started

**Prerequisites:** Node.js 20 or newer and a MongoDB database.

```bash
# 1. Install dependencies
npm install

# 2. Create a .env file (see below)

# 3. Start the server with auto-reload
npx nodemon index.js
```

The API runs at http://localhost:8000.

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `CLIENT_URL` | Frontend URL with no trailing slash (for example `http://localhost:3000`). Used for CORS and to load the JWKS from `<CLIENT_URL>/api/auth/jwks` |
| `PORT` | Optional. Defaults to `8000` |

## Authentication

Protected routes expect a header:

```
Authorization: Bearer <jwt>
```

- `verifyToken`: requires a valid token, otherwise responds with `401`. On success `req.user = { id, name, email }`.
- `optionalAuth`: same check, but lets logged-out visitors through with `req.user` undefined.

## API Reference

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/` | none | Health check |
| GET | `/recent-events` | none | Next 6 upcoming events (date today or later), soonest first |
| GET | `/events` | none | All events sorted by date |
| GET | `/events/:id` | optional | One event, plus `joinedByMe` for logged-in users |
| POST | `/events` | required | Create an event (organizer taken from the token) |
| GET | `/my-events` | required | Events created by the logged-in user |
| PUT | `/events/:id` | required | Update an event (owner only) |
| DELETE | `/events/:id` | required | Delete an event and its joins (owner only) |
| POST | `/events/:id/join` | required | Join an event |
| DELETE | `/events/:id/join` | required | Leave an event |
| GET | `/my-joined-events` | required | Events the logged-in user has joined |

Errors are returned as JSON: `{ "message": "..." }` with the matching status code (`400` invalid input or id, `401` missing or invalid token, `404` not found or not owned by you, `500` server error).

## Data Model

**`events`**

| Field | Rules |
|---|---|
| `title` | text, at least 5 characters |
| `type` | one of: Donation, Cleanup, Plantation, Winter Relief, Food Drive, Health Camp, Education |
| `date` | `YYYY-MM-DD`, today or later |
| `location` | text, at least 3 characters |
| `thumbnail` | direct `http(s)` image URL |
| `description` | text, at least 20 characters |
| `organizerId`, `organizerName`, `organizerEmail` | taken from the verified token |
| `createdAt`, `updatedAt` | set by the server |

**`joins`**

| Field | Description |
|---|---|
| `eventId` | ObjectId of the event |
| `userId` | id of the user who joined |
| `joinedAt` | date of joining |

A unique index on `{ eventId, userId }` prevents joining the same event twice.