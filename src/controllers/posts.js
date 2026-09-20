export function postController(posts) {
  return {
    async list(req, res) {
      res.json(await posts.list(req.validated.query));
    },
    async get(req, res) {
      res.json({ data: await posts.get(req.validated.params.id) });
    },
    async create(req, res) {
      const post = await posts.create(req.session.userId, req.validated.body);
      res.location(`/api/v1/posts/${post.id}`).status(201).json({ data: post });
    },
    async update(req, res) {
      res.json({ data: await posts.update(req.validated.params.id, req.session.userId, req.validated.body) });
    },
    async delete(req, res) {
      await posts.delete(req.validated.params.id, req.session.userId);
      res.status(204).end();
    },
  };
}
