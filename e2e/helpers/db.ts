import postgres from 'postgres'

const DATABASE_URL =
	process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * Client postgres pour les helpers de test (accès direct à la DB locale).
 * À utiliser UNIQUEMENT dans les tests — jamais dans le code app.
 *
 * Usage :
 *   import { db } from './helpers/db'
 *   await db`DELETE FROM public.groups WHERE name LIKE 'E2E%'`
 *   await db.end()   // dans afterAll si besoin
 */
export const db = postgres(DATABASE_URL, { max: 3 })

/**
 * Supprime toutes les données de test créées pendant un run E2E
 * (préfixe "E2E" sur les noms de groupes, paris générés par les tests).
 * Les users seedés (alice/bob/carol/dave) ne sont pas supprimés.
 */
export async function cleanTestData() {
	// Ordre : clés étrangères respectées
	await db`DELETE FROM public.ledger_entries WHERE match_id IN (
    SELECT m.id FROM public.matches m
    JOIN public.bets b ON b.id = m.bet_id
    WHERE b.title LIKE '[E2E]%'
  )`
	await db`DELETE FROM public.bets WHERE title LIKE '[E2E]%'`
	await db`DELETE FROM public.groups WHERE name LIKE '[E2E]%'`
}
