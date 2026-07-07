import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

// ─── Email abstraction ───────────────────────────────────────────────────────
//
// Deux implémentations, sélectionnées par env var :
//   - `RESEND_API_KEY` présent → Resend (prod).
//   - sinon → SMTP local (Mailpit en dev/test, port 54325 sur l'instance
//     Supabase locale).
//
// L'envoi est toujours best-effort : `sendEmail` lève `EmailSendError`
// (porteur d'un `code` stable, sans message brut susceptible de contenir des
// PII) en cas d'échec. L'appelant (notifications.ts) l'attrape, logge et émet
// un event PostHog `notification_email_failed` avec le `code` uniquement.

export interface SendEmailInput {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

export interface SendEmailResult {
	messageId: string;
}

export type EmailErrorCode = 'send_failed' | 'config_error' | 'unknown';

/**
 * Erreur d'envoi d'email. Le `code` est stable et destiné au tracking
 * (PostHog) — jamais le message brut (peut contenir des PII côté provider).
 */
export class EmailSendError extends Error {
	readonly code: EmailErrorCode;
	constructor(code: EmailErrorCode, message: string) {
		super(message);
		this.name = 'EmailSendError';
		this.code = code;
	}
}

/** true si Resend est l'impl active (clé présente). */
export function isResendEnabled(): boolean {
	return !!env.RESEND_API_KEY;
}

/** Adresse "From" : Resend impose un domaine vérifié ; SMTP local accepte tout. */
function senderAddress(): string {
	return (
		env.EMAIL_FROM ?? (env.RESEND_API_KEY ? 'onboarding@resend.dev' : 'noreply@betwithfriend.app')
	);
}

function senderName(): string {
	return env.EMAIL_FROM_NAME ?? 'Bet With Friend';
}

function fromHeader(): string {
	return `${senderName()} <${senderAddress()}>`;
}

// ─── Resend (lazy singleton) ──────────────────────────────────────────────────

let _resend: Resend | null | undefined = undefined;

function getResend(): Resend | null {
	if (_resend === undefined) {
		_resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
	}
	return _resend;
}

// ─── SMTP / Mailpit (lazy singleton) ──────────────────────────────────────────

let _smtp: Transporter | null | undefined = undefined;

function getSmtp(): Transporter | null {
	if (_smtp === undefined) {
		if (env.RESEND_API_KEY) {
			_smtp = null;
		} else {
			const host = env.SMTP_HOST ?? '127.0.0.1';
			const port = Number(env.SMTP_PORT ?? '54325');
			_smtp = nodemailer.createTransport({
				host,
				port,
				secure: false,
				// Mailpit en local : pas de TLS, on ne vérifie pas le certif.
				ignoreTLS: true,
				tls: { rejectUnauthorized: false }
			});
		}
	}
	return _smtp;
}

/**
 * Envoie un email. Lève `EmailSendError` en cas d'échec (code stable, pas de
 * message brut pour éviter de fuiter des PII dans le tracking).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
	const from = fromHeader();

	// ── Resend (prod) ──
	const resend = getResend();
	if (resend) {
		try {
			const { data, error } = await resend.emails.send({
				from,
				to: input.to,
				subject: input.subject,
				text: input.text,
				html: input.html ?? input.text
			});
			if (error) {
				throw new EmailSendError('send_failed', `resend: ${error.name ?? 'error'}`);
			}
			return { messageId: data?.id ?? 'unknown' };
		} catch (err) {
			if (err instanceof EmailSendError) throw err;
			throw new EmailSendError('send_failed', String(err instanceof Error ? err.name : err));
		}
	}

	// ── SMTP local (dev/test) ──
	const smtp = getSmtp();
	if (smtp) {
		try {
			const info = await smtp.sendMail({
				from,
				to: input.to,
				subject: input.subject,
				text: input.text,
				html: input.html
			});
			return { messageId: info.messageId };
		} catch (err) {
			throw new EmailSendError('send_failed', String(err instanceof Error ? err.name : err));
		}
	}

	throw new EmailSendError('config_error', 'No email transport configured');
}
