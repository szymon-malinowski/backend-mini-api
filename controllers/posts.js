import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database } from '../src/db.js';
import { makeError } from '../middleware/errors.js';

const newPost = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(5000),
}).strict();

const changedPost = newPost.partial().refine(
  value => Object.keys(value).length > 0,
  'Send a title, a body, or both.',
);

function postFrom(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    author: row.clerk_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validId(id) {
  if (!z.string().uuid().safeParse(id).success) {
    throw makeError(400, 'Post ID is not valid.');
  }
  return id;
}

function validPost(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) throw makeError(400, 'Please send a valid title and body.');
  return result.data;
}

export async function listPosts(_request, response) {
  const result = await database.query(
    `SELECT posts.*, users.clerk_id
     FROM posts JOIN users ON users.id = posts.user_id
     ORDER BY posts.created_at DESC`,
  );
  response.json(result.rows.map(postFrom));
}

export async function getPost(request, response) {
  const result = await database.query(
    `SELECT posts.*, users.clerk_id
     FROM posts JOIN users ON users.id = posts.user_id
     WHERE posts.id = $1`,
    [validId(request.params.id)],
  );
  if (!result.rows[0]) throw makeError(404, 'Post not found.');
  response.json(postFrom(result.rows[0]));
}

export async function createPost(request, response) {
  const post = validPost(newPost, request.body);
  const result = await database.query(
    'INSERT INTO posts (id, user_id, title, body) VALUES ($1, $2, $3, $4) RETURNING *',
    [randomUUID(), request.user.id, post.title, post.body],
  );
  response.status(201).json(postFrom({ ...result.rows[0], clerk_id: request.user.clerkId }));
}

export async function changePost(request, response) {
  const post = validPost(changedPost, request.body);
  const result = await database.query(
    `UPDATE posts
     SET title = COALESCE($1, title), body = COALESCE($2, body), updated_at = now()
     WHERE id = $3 AND user_id = $4
     RETURNING *`,
    [post.title ?? null, post.body ?? null, validId(request.params.id), request.user.id],
  );
  if (!result.rows[0]) throw makeError(404, 'Post not found or not yours.');
  response.json(postFrom({ ...result.rows[0], clerk_id: request.user.clerkId }));
}

export async function deletePost(request, response) {
  const result = await database.query(
    'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id',
    [validId(request.params.id), request.user.id],
  );
  if (!result.rows[0]) throw makeError(404, 'Post not found or not yours.');
  response.status(204).end();
}
