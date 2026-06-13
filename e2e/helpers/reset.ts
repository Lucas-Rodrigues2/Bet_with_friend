/**
 * Helper de reset entre tests / suites.
 *
 * Pour un reset complet de la DB (re-seed depuis zéro) :
 *   npx supabase db reset   (= npm run db:reset)
 *
 * Pour nettoyer uniquement les données créées en tests sans relancer le seed :
 *   await cleanTestData()   (helpers/db.ts)
 *
 * Ce fichier rassemble les patterns de setup/teardown communs
 * à importer dans les fichiers spec.
 */

export { cleanTestData, db } from './db';
export { login, storageStatePath, USERS, type TestUser } from './auth';
