import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { ApiError } from '../middleware/errors.js';
import { publicUser, userRepository } from '../repositories/users.js';

const hashOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
export async function authService(pool) {
  const users = userRepository(pool);
  const dummyHash = await argon2.hash(randomBytes(32), hashOptions);
  return {
    async register(input) {
      const passwordHash = await argon2.hash(input.password, hashOptions);
      try {
        return publicUser(await users.create({ ...input, passwordHash }));
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'users_email_key') {
          throw new ApiError(409, 'EMAIL_EXISTS', 'Email already registered.');
        }
        throw error;
      }
    },
    async login({ email, password }) {
      const user = await users.byEmail(email);
      const valid = await argon2.verify(user?.password_hash ?? dummyHash, password);
      if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      return publicUser(user);
    },
    async profile(id) {
      const user = await users.byId(id);
      if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required.');
      return publicUser(user);
    },
  };
}
