import { Router } from 'express';
import { authController } from '../controllers/auth.js';
import { postController } from '../controllers/posts.js';
import { requireAuth, requireCsrf } from '../middleware/security.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { validate, registerSchema, loginSchema, postSchema, patchSchema, idSchema, paginationSchema, emptySchema } from '../validators/schemas.js';

export function apiRouter({ pool, config, auth, posts }) {
  const router = Router();
  const users = authController(auth, config);
  const post = postController(posts);
  const authLimit = rateLimit(pool, { scope: 'auth', limit: config.authRateLimit,
    windowMs: 15 * 60 * 1000, secret: config.sessionSecret });
  router.get('/auth/csrf', users.csrf);
  router.post('/auth/register', authLimit, requireCsrf, validate(registerSchema), users.register);
  router.post('/auth/login', authLimit, requireCsrf, validate(loginSchema), users.login);
  router.post('/auth/logout', requireAuth, requireCsrf, validate(emptySchema), users.logout);
  router.get('/users/me', requireAuth, users.profile);
  router.get('/posts', validate(paginationSchema, 'query'), post.list);
  router.get('/posts/:id', validate(idSchema, 'params'), post.get);
  router.post('/posts', requireAuth, requireCsrf, validate(postSchema), post.create);
  router.patch('/posts/:id', requireAuth, requireCsrf, validate(idSchema, 'params'), validate(patchSchema), post.update);
  router.delete('/posts/:id', requireAuth, requireCsrf, validate(idSchema, 'params'), validate(emptySchema), post.delete);
  return router;
}
