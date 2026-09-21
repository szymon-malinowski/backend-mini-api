import { getAuth } from '@clerk/express';
import { randomUUID } from 'node:crypto';
import { database } from '../src/db.js';
import { makeError } from './errors.js';

// Clerk says who is signed in. PostgreSQL keeps a matching user and session.
export async function signedIn(request, _response, next) {
  try {
    const { userId, sessionId } = getAuth(request);
    if (!userId || !sessionId) throw makeError(401, 'Please sign in first.');

    const userResult = await database.query(
      `INSERT INTO users (id, clerk_id)
       VALUES ($1, $2)
       ON CONFLICT (clerk_id) DO UPDATE SET clerk_id = EXCLUDED.clerk_id
       RETURNING id, clerk_id`,
      [randomUUID(), userId],
    );
    const user = userResult.rows[0];

    const sessionResult = await database.query(
      `INSERT INTO sessions (clerk_session_id, user_id, expires_at)
       VALUES ($1, $2, now() + interval '1 day')
       ON CONFLICT (clerk_session_id)
       DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at
       RETURNING clerk_session_id, user_id, expires_at`,
      [sessionId, user.id],
    );

    request.user = {
      id: user.id,
      clerkId: user.clerk_id,
      session: sessionResult.rows[0],
    };
    next();
  } catch (error) {
    next(error);
  }
}
