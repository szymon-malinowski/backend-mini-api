import express from 'express';
import { clerkMiddleware } from '@clerk/express';
import { database } from './src/db.js';
import { signedIn } from './middleware/auth.js';
import { makeError, errorHandler } from './middleware/errors.js';
import { securityMiddleware } from './middleware/security.js';
import {
  listPosts,
  getPost,
  createPost,
  changePost,
  deletePost,
} from './controllers/posts.js';
import { showMe } from './controllers/users.js';

const requiredSettings = ['DATABASE_URL', 'CLERK_SECRET_KEY', 'ALLOWED_ORIGIN'];
for (const setting of requiredSettings) {
  if (!process.env[setting]) throw new Error(`${setting} is required.`);
}

const app = express();
const port = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(...securityMiddleware(process.env.ALLOWED_ORIGIN));
app.use(clerkMiddleware());

app.get('/api/posts', listPosts);
app.get('/api/posts/:id', getPost);
app.post('/api/posts', signedIn, createPost);
app.patch('/api/posts/:id', signedIn, changePost);
app.delete('/api/posts/:id', signedIn, deletePost);
app.get('/api/me', signedIn, showMe);

app.use((_request, _response, next) => next(makeError(404, 'Page not found.')));
app.use(errorHandler);

app.listen(port, () => console.log(`API is ready on port ${port}.`));

process.on('SIGTERM', async () => {
  await database.end();
  process.exit(0);
});
