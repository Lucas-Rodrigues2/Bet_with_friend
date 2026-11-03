// /favicon.ico — servi par route (la table MIME du serveur statique ne connaît pas .ico).
import icon from '$lib/assets/favicon.ico?inline';
import type { RequestHandler } from './$types';

const dataUrl: string = icon;
const bytes = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');

export const GET: RequestHandler = () =>
	new Response(bytes, {
		headers: {
			'content-type': 'image/x-icon',
			'cache-control': 'public, max-age=604800'
		}
	});
