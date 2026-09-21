# Mini Post API

This is a small API for writing posts. PostgreSQL stores users, posts, and session records. Clerk tells the API who is signed in.

## Files

| File           | Job                                    |
| -------------- | -------------------------------------- |
| `server.js`    | The whole API in one easy-to-read file |
| `database.sql` | Creates the PostgreSQL tables          |
| `.env.example` | Shows the settings the API needs       |

The code is split into small folders: `controllers/` handles requests, `middleware/` checks safety and sign-in, and `src/db.js` connects to PostgreSQL.

## Database

```text
One user can have many posts.
One user can have many sessions.
```

`posts.user_id` connects every post to its owner. `sessions` keeps a PostgreSQL record of each Clerk session used by the API.

## Endpoints

| Method | URL              | What it does                 |
| ------ | ---------------- | ---------------------------- |
| GET    | `/api/posts`     | Show all posts               |
| GET    | `/api/posts/:id` | Show one post                |
| POST   | `/api/posts`     | Create a post when signed in |
| PATCH  | `/api/posts/:id` | Change your own post         |
| DELETE | `/api/posts/:id` | Delete your own post         |
| GET    | `/api/me`        | Show the signed-in user      |

To create a post, send JSON like this:

```json
{
  "title": "My first post",
  "body": "Hello!"
}
```

## Setup

Create a PostgreSQL database and apply `database.sql`. Copy `.env.example` to `.env`, then add your PostgreSQL URL, Clerk keys, allowed frontend address, and port.

## Safety

- Clerk middleware checks who is signed in.
- A user can only change or delete their own post.
- Zod checks post input before it reaches the database.
- PostgreSQL placeholders keep SQL input safe.
- Helmet adds security headers.
- Only the website in `ALLOWED_ORIGIN` can make browser requests.
- Error replies do not reveal database details.
