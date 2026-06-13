#!/usr/bin/env node
/**
 * Gestion des worktrees isolés pour l'exécution parallèle des stories.
 *
 * Chaque story parallèle tourne sur un « slot » (1..3) qui lui donne :
 *   - un worktree git dédié dans .worktrees/<ID> sur la branche story/<ID>
 *   - sa PROPRE stack Supabase locale (project_id + ports décalés)
 *   - un port de serveur de dev dédié
 * => aucune collision de DB ni de port entre stories qui tournent en même temps.
 *
 * Schéma des ports par slot (offset Supabase = slot*100, dev = 5173+slot) :
 *   slot 1 : api 54421 · db 54422 · dev 5174
 *   slot 2 : api 54521 · db 54522 · dev 5175
 *   slot 3 : api 54621 · db 54622 · dev 5176
 *
 * Usage :
 *   node scripts/worktree.mjs setup    <ID> <slot> [baseRef]
 *   node scripts/worktree.mjs teardown <ID> [--delete-branch]
 *   node scripts/worktree.mjs list
 *   node scripts/worktree.mjs ports    <slot>      # affiche les ports d'un slot (JSON)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const WT_DIR = '.worktrees';

/** Ports dérivés d'un slot. */
function portsForSlot(slot) {
	const s = Number(slot);
	if (![1, 2, 3].includes(s)) {
		throw new Error(`slot invalide: ${slot} (attendu 1, 2 ou 3)`);
	}
	const off = s * 100;
	return {
		slot: s,
		devPort: 5173 + s,
		api: 54321 + off,
		db: 54322 + off,
		shadow: 54320 + off,
		pooler: 54329 + off,
		studio: 54323 + off,
		inbucket: 54324 + off,
		analytics: 54327 + off,
		inspector: 8083 + s * 10
	};
}

function sh(cmd, opts = {}) {
	return execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}
function shOut(cmd, opts = {}) {
	return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT, ...opts })
		.toString()
		.trim();
}

function branchExists(branch) {
	try {
		shOut(`git rev-parse --verify --quiet refs/heads/${branch}`);
		return true;
	} catch {
		return false;
	}
}

/** Réécrit supabase/config.toml du worktree avec project_id + ports du slot. */
function patchConfig(wtPath, id, p) {
	const cfgPath = path.join(wtPath, 'supabase', 'config.toml');
	let cfg = fs.readFileSync(cfgPath, 'utf8');
	const projectId = `bwf-${id.toLowerCase()}`;
	cfg = cfg.replace(/^project_id = ".*"$/m, `project_id = "${projectId}"`);
	// Les ports par défaut sont uniques dans le fichier : remplacement direct.
	const map = [
		[54321, p.api],
		[54322, p.db],
		[54320, p.shadow],
		[54329, p.pooler],
		[54323, p.studio],
		[54324, p.inbucket],
		[54327, p.analytics],
		[8083, p.inspector]
	];
	for (const [from, to] of map) {
		cfg = cfg.replaceAll(String(from), String(to));
	}
	// URLs d'auth -> port de dev du slot
	cfg = cfg.replaceAll('localhost:5173', `localhost:${p.devPort}`);
	fs.writeFileSync(cfgPath, cfg);
	return projectId;
}

/** Génère le .env du worktree depuis .env.test, ports décalés + PLAYWRIGHT_PORT. */
function writeEnv(wtPath, p) {
	const src = fs.readFileSync(path.join(ROOT, '.env.test'), 'utf8');
	let env = src
		.replaceAll('127.0.0.1:54321', `127.0.0.1:${p.api}`)
		.replaceAll('127.0.0.1:54322', `127.0.0.1:${p.db}`);
	env += `\n# Injecté par scripts/worktree.mjs (slot ${p.slot})\nPLAYWRIGHT_PORT=${p.devPort}\n`;
	fs.writeFileSync(path.join(wtPath, '.env'), env);
}

function setup(id, slot, baseRef = 'HEAD') {
	const p = portsForSlot(slot);
	const wtPath = path.join(WT_DIR, id);
	const branch = `story/${id}`;

	if (fs.existsSync(wtPath)) {
		throw new Error(
			`${wtPath} existe déjà — lance d'abord: node scripts/worktree.mjs teardown ${id}`
		);
	}
	fs.mkdirSync(WT_DIR, { recursive: true });

	console.log(`\n▶ worktree ${id} sur slot ${slot} (dev:${p.devPort} api:${p.api} db:${p.db})`);
	if (branchExists(branch)) {
		sh(`git worktree add "${wtPath}" ${branch}`);
	} else {
		sh(`git worktree add "${wtPath}" -b ${branch} ${baseRef}`);
	}

	const projectId = patchConfig(wtPath, id, p);
	writeEnv(wtPath, p);

	console.log(`▶ npm ci (${wtPath})`);
	sh('npm ci', { cwd: path.join(ROOT, wtPath) });

	console.log(`▶ supabase start (project ${projectId})`);
	sh('npx supabase start', { cwd: path.join(ROOT, wtPath) });

	console.log('▶ supabase db reset (seed)');
	sh('npx supabase db reset', { cwd: path.join(ROOT, wtPath) });

	console.log('\n✅ worktree prêt :');
	console.log(
		JSON.stringify(
			{
				id,
				slot: p.slot,
				path: wtPath,
				branch,
				projectId,
				devPort: p.devPort,
				apiPort: p.api,
				dbPort: p.db
			},
			null,
			2
		)
	);
	console.log(
		`\nPour les agents : cd ${wtPath} ; serveur dev sur http://localhost:${p.devPort}\n` +
			`Tests : (depuis ${wtPath}) npm run test:e2e   (Playwright lit .env -> PLAYWRIGHT_PORT=${p.devPort})`
	);
}

function teardown(id, { deleteBranch = false } = {}) {
	const wtPath = path.join(WT_DIR, id);
	const branch = `story/${id}`;
	if (fs.existsSync(wtPath)) {
		try {
			console.log(`▶ supabase stop (${wtPath})`);
			sh('npx supabase stop', { cwd: path.join(ROOT, wtPath) });
		} catch (e) {
			console.warn(`⚠ supabase stop a échoué (peut-être déjà arrêté) : ${e.message}`);
		}
		console.log(`▶ git worktree remove ${wtPath}`);
		sh(`git worktree remove "${wtPath}" --force`);
	} else {
		console.log(`(${wtPath} absent)`);
	}
	sh('git worktree prune');
	if (deleteBranch && branchExists(branch)) {
		sh(`git branch -D ${branch}`);
	}
	console.log(`✅ teardown ${id} terminé`);
}

function list() {
	console.log(shOut('git worktree list'));
}

const [, , cmd, ...args] = process.argv;
try {
	switch (cmd) {
		case 'setup':
			setup(args[0], args[1], args[2]);
			break;
		case 'teardown':
			teardown(args[0], { deleteBranch: args.includes('--delete-branch') });
			break;
		case 'list':
			list();
			break;
		case 'ports':
			console.log(JSON.stringify(portsForSlot(args[0]), null, 2));
			break;
		default:
			console.error(
				'Commandes : setup <ID> <slot> [baseRef] | teardown <ID> [--delete-branch] | list | ports <slot>'
			);
			process.exit(1);
	}
} catch (e) {
	console.error(`✗ ${e.message}`);
	process.exit(1);
}
