const assert = require('node:assert/strict');
const test = require('node:test');
const pool = require('../database');

test('converts MySQL-style placeholders without changing quoted question marks', () => {
  const sql = "SELECT * FROM users WHERE email = ? AND note = '?' AND label = \"?\" AND id = ?";
  assert.equal(
    pool.toPostgresPlaceholders(sql),
    "SELECT * FROM users WHERE email = $1 AND note = '?' AND label = \"?\" AND id = $2"
  );
});

test('preserves doubled apostrophes while converting query parameters', () => {
  assert.equal(
    pool.toPostgresPlaceholders("SELECT '?' AS mark, 'it''s ok' AS note, id FROM users WHERE id = ?"),
    "SELECT '?' AS mark, 'it''s ok' AS note, id FROM users WHERE id = $1"
  );
});

test('keeps certificate validation enabled by default', () => {
  assert.deepEqual(pool.getPostgresSslConfig('true'), { rejectUnauthorized: true });
});

test('allows encrypted PostgreSQL connections without certificate validation when explicitly requested', () => {
  assert.deepEqual(pool.getPostgresSslConfig('require'), { rejectUnauthorized: false });
});

test('disables PostgreSQL TLS only when explicitly set to false', () => {
  assert.equal(pool.getPostgresSslConfig('false'), false);
});
