// ─── Helper pour les tests push nécessitant un vrai abonnement navigateur ────
//
// Le mode headless ET les contextes incognito de Chromium bloquent l'API Push
// (cf. crbug.com/41124656 : "Chrome currently does not support the Push API
// in incognito mode"). Pour tester le bouton « Activer les notifications push »
// via l'UI réelle, il faut un contexte PERSISTENT (non-incognito) ET un
// affichage (headless: false + Xvfb si pas de DISPLAY).
//
// Ce helper démarre Xvfb au besoin (idempotent via variable DISPLAY) et lance
// un contexte persistant headed. Le profil est isolé dans un temp dir.
import { chromium, type BrowserContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let xvfbProc: ChildProcess | null = null;

async function ensureXvfb(): Promise<void> {
	if (process.env.DISPLAY) return;
	try {
		xvfbProc = spawn('Xvfb', [':99', '-screen', '0', '1280x800x24'], {
			stdio: 'ignore',
			detached: false
		});
		process.env.DISPLAY = ':99';
		// Laisser Xvfb démarrer.
		await new Promise((r) => setTimeout(r, 1500));
	} catch {
		// Pas de Xvfb disponible — les tests headed échoueront avec un message clair.
	}
}

export interface HeadedPushContext {
	context: BrowserContext;
	profileDir: string;
}

/**
 * Lance un contexte persistant headed (non-incognito) avec la permission
 * notifications granted. Démarre Xvfb si aucun DISPLAY n'est présent.
 */
export async function launchHeadedPushContext(): Promise<HeadedPushContext> {
	await ensureXvfb();
	const profileDir = mkdtempSync(join(tmpdir(), 'pw-push-'));
	const context = await chromium.launchPersistentContext(profileDir, {
		headless: false,
		permissions: ['notifications']
	});
	return { context, profileDir };
}

export async function closeHeadedPushContext(ctx: HeadedPushContext): Promise<void> {
	try {
		await ctx.context.close();
	} catch {
		// ignore
	}
	try {
		rmSync(ctx.profileDir, { recursive: true, force: true });
	} catch {
		// ignore
	}
}
