import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Supabase cloud exige SSL ; on l'active pour toute connexion non-localhost.
const isLocalhost = /@(127\.0\.0\.1|localhost)(:|$)/.test(env.DATABASE_URL);

const client = postgres(env.DATABASE_URL, {
	ssl: isLocalhost ? false : 'require'
});

export const db = drizzle(client, { schema });
