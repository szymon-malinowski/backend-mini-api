import { cookieOptions, newSessionState, sessionAction } from '../middleware/security.js';

export function authController(auth, config) {
  return {
    async csrf(req, res) {
      if (!req.session.csrfToken) newSessionState(req.session);
      await sessionAction(req.session, 'save');
      res.json({ data: { csrfToken: req.session.csrfToken } });
    },
    async register(req, res) {
      res.status(201).json({ data: await auth.register(req.validated.body) });
    },
    async login(req, res) {
      const user = await auth.login(req.validated.body);
      await sessionAction(req.session, 'regenerate');
      newSessionState(req.session);
      req.session.userId = user.id;
      await sessionAction(req.session, 'save');
      res.json({ data: user });
    },
    async logout(req, res) {
      await sessionAction(req.session, 'destroy');
      res.clearCookie('mini.sid', cookieOptions(config.production));
      res.status(204).end();
    },
    async profile(req, res) {
      res.json({ data: await auth.profile(req.session.userId) });
    },
  };
}
