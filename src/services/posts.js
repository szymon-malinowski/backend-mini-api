import { postRepository } from '../repositories/posts.js';
import { ApiError } from '../middleware/errors.js';

export function postService(pool) {
  const posts = postRepository(pool);
  async function get(id) {
    const post = await posts.get(id);
    if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Post not found.');
    return post;
  }
  async function requireOwner(id, authorId) {
    const post = await get(id);
    if (post.author.id !== authorId) throw new ApiError(403, 'FORBIDDEN', 'Only the author can modify this post.');
  }
  return {
    get,
    list: input => posts.list(input),
    create: (authorId, input) => posts.create(authorId, input),
    async update(id, authorId, input) {
      await requireOwner(id, authorId);
      const post = await posts.update(id, authorId, input);
      if (!post) throw new ApiError(404, 'POST_NOT_FOUND', 'Post not found.');
      return post;
    },
    async delete(id, authorId) {
      await requireOwner(id, authorId);
      if (!await posts.delete(id, authorId)) throw new ApiError(404, 'POST_NOT_FOUND', 'Post not found.');
    },
  };
}
