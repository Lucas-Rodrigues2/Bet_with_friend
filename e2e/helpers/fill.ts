import { expect, type Locator } from '@playwright/test';

/**
 * Remplit un champ en vérifiant que la valeur « tient » dans le DOM (retry borné).
 *
 * La ré-hydratation Svelte peut réinitialiser un champ juste après un
 * remplissage : les caractères tapés au clavier disparaissent au milieu, ou la
 * valeur posée par fill() est écrasée par un re-rendu. On retente jusqu'à ce
 * que la valeur soit stable avant de passer à la suite.
 */
export async function fillSticky(locator: Locator, value: string): Promise<void> {
	await expect(async () => {
		await locator.fill(value);
		await expect(locator).toHaveValue(value);
	}).toPass({ timeout: 10_000, intervals: [200, 400, 800] });
}
