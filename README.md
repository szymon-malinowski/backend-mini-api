# Mini Post API

A small Express API for creating and managing posts. PostgreSQL stores users, posts, and Clerk session records. Clerk identifies the signed-in user.

## Requirements

- Node.js 20 or newer
- PostgreSQL
- A Clerk application

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a PostgreSQL database and run [`database.sql`](database.sql).

3. Copy [`.env.example`](.env.example) to `.env` and set these values:

| Variable                | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                                         |
| `CLERK_SECRET_KEY`      | Secret key from Clerk                                                |
| `CLERK_PUBLISHABLE_KEY` | Publishable Clerk key for the client                                 |
| `ALLOWED_ORIGIN`        | Frontend origin allowed by CORS, for example `http://localhost:3000` |
| `PORT`                  | API port, defaulting to `3000`                                       |

4. Start the API:

```bash
npm start
```

The API is available at `http://localhost:3000` unless another `PORT` is configured.

## Tests

Run the Jest test suite with:

```bash
npm test
```

The tests cover security origin checks and public error responses without needing a running PostgreSQL or Clerk instance.

## Endpoints

| Method | URL              | Auth  | Description                             |
| ------ | ---------------- | ----- | --------------------------------------- |
| GET    | `/api/posts`     | No    | List posts, newest first                |
| GET    | `/api/posts/:id` | No    | Get one post                            |
| POST   | `/api/posts`     | Clerk | Create a post                           |
| PATCH  | `/api/posts/:id` | Clerk | Update your own post                    |
| DELETE | `/api/posts/:id` | Clerk | Delete your own post                    |
| GET    | `/api/me`        | Clerk | Get the current user and session expiry |

Authenticated requests must include the Clerk session credentials. Create and update requests use JSON.

### Create a post

`POST /api/posts`

```json
{
  "title": "My first post",
  "body": "Hello!"
}
```

Both fields are required when creating a post. `title` is limited to 100 characters and `body` to 5,000 characters. Updates may include `title`, `body`, or both.

## Project structure

| Path           | Responsibility                               |
| -------------- | -------------------------------------------- |
| `server.js`    | Creates the Express app and registers routes |
| `controllers/` | Handles users and posts                      |
| `middleware/`  | Authentication, security, and error handling |
| `src/db.js`    | Creates the PostgreSQL connection pool       |
| `database.sql` | Defines users, posts, sessions, and indexes  |

## Security

- Clerk middleware protects authenticated routes.
- Users can only update or delete their own posts.
- Zod validates request bodies and UUID route parameters.
- Parameterized PostgreSQL queries protect against SQL injection.
- Helmet adds security headers.
- CORS allows only `ALLOWED_ORIGIN` and credentials.
- JSON requests are limited to 20 KB.
- Error responses avoid exposing database details.
