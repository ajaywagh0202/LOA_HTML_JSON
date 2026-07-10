import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.POSTGRES_URI || process.env.DATABASE_URL;

export const postgresPool = new Pool(
  connectionString
    ? { connectionString, connectionTimeoutMillis: 5000 }
    : {
        host: process.env.POSTGRES_HOST || '10.31.3.102',
        port: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'LAR',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'mukesh',
        connectionTimeoutMillis: 5000
      }
);
