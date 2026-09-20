# Security control mapping

| Concern | Implemented control | Verification |
| --- | --- | --- |
| Password exposure | Argon2id, no password/hash in responses, safe logging | Registration/hash and error tests |
| Login enumeration | Generic errors and dummy hash verification | Unknown/wrong credential comparison |
| Session fixation/replay | PostgreSQL sessions, login rotation, logout deletion | Old-cookie and logout replay tests |
| Session lifetime | Absolute 24-hour expiry and database expiration | Both expiry paths tested |
| CSRF | Session-bound random token, constant-time comparison, origin checks | Missing/stale/invalid token and origin tests |
| Broken authorization | Server-owned author ID, service and SQL ownership checks | Second-user update/delete and forged author tests |
| SQL injection | Parameterized queries and allowlisted update fields | Injection string stored as data |
| Mass assignment/input errors | Strict schemas, length bounds, UUID and pagination validation | Invalid fields, IDs, empty patches and limits |
| Resource abuse | JSON size cap, request and auth rate limits, bounded page size | 413/429 and pagination tests |
| Browser protections | Helmet, HttpOnly/SameSite cookies, explicit CORS, no-store | Header, CORS and production cookie tests |
| Transport/proxy trust | HTTPS required in production, explicit trusted proxy addresses | HTTPS-required and secure-cookie tests |
| Data integrity | PostgreSQL foreign keys, uniqueness, check constraints, transactions | Constraint and migration tests |
| Error disclosure | Central error envelope and allowlisted log fields | Injected database failure test |
| Secret management | Environment configuration and ignored local state | Configuration validation; repository review |
| Dependency vulnerabilities | Lockfile and npm audit | Run npm audit before release |

Registration intentionally exposes duplicate-email status (`409`). Public posts are plain text and must be escaped by consuming frontends. Rate limits are per IP, so deployment policy may need additional controls for distributed attacks and shared networks.

The exact course security checklist is unavailable. Compare it against this table before submission. Production TLS/proxy configuration, database permissions, backup restoration, monitoring, and dependency reviews remain deployment responsibilities.
