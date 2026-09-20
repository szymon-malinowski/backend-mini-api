CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  display_name VARCHAR(80) NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000 AND body ~ '[^[:space:]]'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX posts_author_idx ON posts(author_id);
CREATE INDEX posts_created_idx ON posts(created_at DESC, id DESC);

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER posts_updated BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX sessions_expire_idx ON sessions(expire);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL CHECK (hits > 0),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(expires_at);
