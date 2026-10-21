require('dotenv').config();

const { Pool } = require('pg');

function toPostgresPlaceholders(sql) {
  let parameter = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let converted = '';

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (character === "'" && !inDoubleQuote) {
      if (inSingleQuote && sql[index + 1] === "'") {
        converted += "''";
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (character === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    if (character === '?' && !inSingleQuote && !inDoubleQuote) {
      parameter += 1;
      converted += `$${parameter}`;
    } else {
      converted += character;
    }
  }

  return converted;
}

function getPostgresSslConfig(value = process.env.DATABASE_SSL) {
  if (value === 'false') return false;
  return { rejectUnauthorized: value !== 'require' };
}

function createMysqlCompatiblePool(pool) {
  async function executeWith(client, sql, values = []) {
    const result = await client.query(toPostgresPlaceholders(sql), values);
    if (result.command === 'SELECT' || result.command === 'SHOW') {
      return [result.rows, result.fields];
    }
    return [{
      insertId: result.rows[0]?.id,
      affectedRows: result.rowCount,
    }, result.fields];
  }

  const adapter = {
    query: (sql, values) => executeWith(pool, sql, values),
    execute: (sql, values) => executeWith(pool, sql, values),
    async getConnection() {
      const client = await pool.connect();
      return {
        query: (sql, values) => executeWith(client, sql, values),
        execute: (sql, values) => executeWith(client, sql, values),
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release(),
      };
    },
    end: () => pool.end(),
    postgres: true,
  };

  return adapter;
}

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: getPostgresSslConfig(),
  });
  module.exports = createMysqlCompatiblePool(pool);
} else if (process.env.NODE_ENV !== 'production' && process.env.DB_HOST) {
  module.exports = require('mysql2/promise').createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
} else {
  throw new Error('Configure DATABASE_URL for Supabase PostgreSQL or local MySQL variables for development.');
}

module.exports.toPostgresPlaceholders = toPostgresPlaceholders;
module.exports.getPostgresSslConfig = getPostgresSslConfig;
