type Window = { count: number; resetAt: number };

// Per-process defence in depth; this is not a distributed or persistent limit.
const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

export function consumeLimit(key: string, limit: number, periodMs: number): number | null {
	const now = Date.now();
	let window = windows.get(key);
	if (window && window.resetAt <= now) {
		windows.delete(key);
		window = undefined;
	}
	if (!window) {
		if (windows.size >= MAX_KEYS) {
			for (const [existingKey, existing] of windows) {
				if (existing.resetAt <= now) windows.delete(existingKey);
			}
			// Refuse new keys while full rather than allowing a memory exhaustion bypass.
			if (windows.size >= MAX_KEYS) return Math.ceil(periodMs / 1000);
		}
		window = { count: 0, resetAt: now + periodMs };
		windows.set(key, window);
	}
	if (window.count >= limit) return Math.max(1, Math.ceil((window.resetAt - now) / 1000));
	window.count++;
	return null;
}
