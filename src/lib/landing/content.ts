/**
 * Contenu de la page d'accueil (landing) — FR et EN.
 * Toutes les chaînes visibles sont ici : la mise en forme vit dans
 * `Landing.svelte`, commune aux deux langues.
 */
import { UsersRound, MessagesSquare, Gavel, type Icon as IconType } from '@lucide/svelte';

export interface Step {
	number: string;
	title: string;
	text: string;
	icon: typeof IconType;
}

export interface LandingContent {
	lang: 'fr' | 'en';
	langSwitchLabel: string;
	hero: {
		badge: string;
		/** Ligne 1 du titre principal (avant la 2ᵉ ligne). */
		headlineLine1: string;
		headlineLine2: string;
		/** Partie du titre en italique (accent éditorial). */
		headlineEm: string;
		tagline: string;
		sub: string;
		ctaPrimary: string;
		ctaSecondary: string;
		ctaApp: string;
		chips: string[];
		pointsNote: string;
		sceneCaption: string;
		sceneStamp1: string;
		sceneStamp2: string;
		footLeft: string;
		footRight: string;
	};
	mockup: {
		groupName: string;
		members: string;
		status: string;
		deadline: string;
		format: string;
		question: string;
		stakeLabel: string;
		stake: string;
		answersLabel: string;
		answers: string;
		guessTitle: string;
		played: string;
		placeholder: string;
		join: string;
		verdictLabel: string;
		verdict: string;
	};
	how: {
		eyebrow: string;
		title: string;
		steps: Step[];
	};
	formats: {
		eyebrow: string;
		title: string;
		intro: string;
		closest: { tag: string; title: string; text: string; example: string };
		challenge: { tag: string; title: string; text: string; example: string };
	};
	rules: {
		eyebrow: string;
		title: string;
		intro: string;
		seal1: string;
		seal2: string;
		items: { title: string; text: string }[];
	};
	faq: {
		title: string;
		items: { q: string; a: string }[];
	};
	cta: {
		eyebrow: string;
		title: string;
		text: string;
	};
	footer: {
		claim: string;
		note: string;
	};
}

export const fr: LandingContent = {
	lang: 'fr',
	langSwitchLabel: 'English',
	hero: {
		badge: 'Sans argent réel. Juste l\u2019honneur.',
		headlineLine1: 'Les paris entre amis',
		headlineLine2: 'ont du',
		headlineEm: 'piquant.',
		tagline: 'Transforme les « je te parie que… » en vrais défis entre amis.',
		sub: "L'app de paris entre amis qui se souvient de qui avait raison et tient les comptes. Mises en points virtuels ou gages — jamais d'argent réel.",
		ctaPrimary: 'Créer un compte',
		ctaSecondary: 'Se connecter',
		ctaApp: 'Mes groupes',
		chips: ['Gratuit', 'Sans carte bancaire'],
		pointsNote: "Juste pour le fun. Chaque mise est en points virtuels — jamais d'argent.",
		sceneCaption: 'CETTE SEMAINE DANS LE GROUPE',
		sceneStamp1: 'AUCUN ARGENT',
		sceneStamp2: "QUE L'HONNEUR",
		footLeft: 'PRENDS POSITION. CHOISIS TON CAMP.',
		footRight: 'QUE LA RIVALITÉ COMMENCE ↓'
	},
	mockup: {
		groupName: 'Les potes du dimanche',
		members: '8 membres',
		status: 'Ouvert',
		deadline: "Jusqu'à 20h45",
		format: 'Au plus proche',
		question: 'Combien de buts ce soir ?',
		stakeLabel: 'Mise',
		stake: '5 points',
		answersLabel: 'Réponses',
		answers: 'Cachées',
		guessTitle: 'Ta prédiction',
		played: '3 amis ont joué',
		placeholder: 'Écris ta réponse…',
		join: 'Participer',
		verdictLabel: 'Dernier verdict',
		verdict: 'Marie gagne +15 pts'
	},
	how: {
		eyebrow: 'Comment ça marche',
		title: 'Trois étapes, et plus aucun « je t\u2019avais dit ».',
		steps: [
			{
				number: '01',
				title: 'Rassemble ta bande',
				text: 'Crée un groupe et envoie le lien. Tes amis peuvent rejoindre en invité, sans créer de compte.',
				icon: UsersRound
			},
			{
				number: '02',
				title: 'Lance le pari',
				text: 'Tu choisis le format, la mise en points ou le gage, qui participe et qui siègera au jury.',
				icon: MessagesSquare
			},
			{
				number: '03',
				title: 'Le jury tranche',
				text: "Quand l'événement a eu lieu, le jury vote. L'app met les comptes à jour toute seule.",
				icon: Gavel
			}
		]
	},
	formats: {
		eyebrow: 'Les deux formats',
		title: 'Deux façons de se challenger.',
		intro:
			"Un pour deviner un chiffre, l'autre pour parier sur un résultat. Les deux se jouent avec des points ou des gages.",
		closest: {
			tag: '01 — LE PLUS PROCHE GAGNE',
			title: 'Au plus proche',
			text: "Un chiffre à trouver : le score, le nombre de bières, la température à minuit. Le plus proche rafle la mise, et les réponses restent cachées jusqu'à la fin.",
			example: '« Combien de buts ce soir ? »'
		},
		challenge: {
			tag: '02 — OSE LE DÉFI',
			title: 'Défi',
			text: 'Tu prédis Oui ou Non. En face-à-face, tu négocies les termes avec ton adversaire. En défi ouvert, les premiers à accepter verrouillent la mise.',
			example: '« Lucas finira-t-il la course en moins de 2 h ? »'
		}
	},
	rules: {
		eyebrow: 'La compétition, sans les embrouilles',
		title: "L'app garde les règles et les comptes.",
		intro:
			"Tout le monde sait ce qui a été accepté, qui doit voter et ce que le résultat change. Il ne reste qu'à se chambrer.",
		seal1: 'JOUE POUR DES POINTS',
		seal2: "PAS POUR DE L'ARGENT",
		items: [
			{
				title: 'Points & classement',
				text: "Les gains alimentent l'ardoise et le classement de chaque groupe."
			},
			{
				title: 'Gages mémorables',
				text: 'Pas envie de points ? Remplace la mise par un gage à réaliser si tu perds.'
			},
			{
				title: 'Verdict par le jury',
				text: 'Des membres choisis à l\u2019avance votent à la majorité ou à l\u2019unanimité.'
			},
			{
				title: 'Entre vous uniquement',
				text: 'Tu choisis qui voit et qui rejoint chaque pari. Rien n\u2019est public.'
			}
		]
	},
	faq: {
		title: 'Questions fréquentes sur les paris entre amis',
		items: [
			{
				q: 'C\u2019est vraiment gratuit ?',
				a: "Oui. Pas d'abonnement, pas de carte bancaire, pas de version premium cachée : l'application de paris entre amis est gratuite, tu crées ton groupe et tu joues."
			},
			{
				q: 'Il y a de l\u2019argent réel ?',
				a: "Non, jamais. Les mises sont en points virtuels ou en gages : aucun pari en argent réel ne passe par l'app."
			},
			{
				q: 'Comment faire un pari entre amis en ligne ?',
				a: "Tu crées un groupe, tu envoies le lien, chacun dépose sa prédiction ou relève un défi, et un jury choisi à l'avance tranche. L'app tient les comptes en points ou en gages."
			},
			{
				q: 'On peut parier sur le sport entre amis ?',
				a: "Oui : le score d'un match, le buteur, le nombre de cartons… ou n'importe quoi d'autre (la météo, un examen, une série). Tu choisis la question, le format et la mise."
			},
			{
				q: 'Mes amis doivent créer un compte ?',
				a: "Pas forcément. Ils peuvent rejoindre en invité avec le lien du groupe. Un compte devient utile pour retrouver l'historique et le classement."
			},
			{
				q: 'Comment le gagnant est-il désigné ?',
				a: "Tu désignes un jury à l'avance. Quand l'événement est passé, il vote — à la majorité ou à l'unanimité — et l'app met tout à jour."
			},
			{
				q: 'On peut copier la réponse des autres ?',
				a: "Non : les réponses restent cachées jusqu'à la clôture du pari. Tout le monde joue en même temps."
			}
		]
	},
	cta: {
		eyebrow: 'Le prochain pari est à toi',
		title: 'Alors, qui avait raison ?',
		text: "Crée ton groupe en quelques secondes et ne laisse plus aucun « je te l'avais dit » sans preuve."
	},
	footer: {
		claim: 'Gentle Wagers — Paris entre amis, sans argent réel.',
		note: 'Points virtuels et gages uniquement.'
	}
};

export const en: LandingContent = {
	lang: 'en',
	langSwitchLabel: 'Français',
	hero: {
		badge: 'No real money. Just bragging rights.',
		headlineLine1: 'Bets between friends,',
		headlineLine2: 'real',
		headlineEm: 'stakes.',
		tagline: 'Turn \u201cI bet you can\u2019t\u2026\u201d into real challenges between friends.',
		sub: 'The bet-with-friends app that remembers who was right and keeps score. Virtual points or forfeits — never real money.',
		ctaPrimary: 'Create an account',
		ctaSecondary: 'Log in',
		ctaApp: 'My groups',
		chips: ['Free', 'No credit card'],
		pointsNote: 'Just for fun. Every stake is virtual points \u2014 never cash.',
		sceneCaption: 'THIS WEEK IN THE GROUP CHAT',
		sceneStamp1: 'NO CASH',
		sceneStamp2: 'JUST BRAGGING RIGHTS',
		footLeft: 'MAKE A CALL. PICK YOUR SIDE.',
		footRight: 'LET THE FRIENDLY RIVALRY BEGIN \u2193'
	},
	mockup: {
		groupName: 'The Sunday crew',
		members: '8 members',
		status: 'Open',
		deadline: 'Until 8:45 pm',
		format: 'Closest guess',
		question: 'How many goals tonight?',
		stakeLabel: 'Stake',
		stake: '5 points',
		answersLabel: 'Answers',
		answers: 'Hidden',
		guessTitle: 'Your guess',
		played: '3 friends have played',
		placeholder: 'Type your answer\u2026',
		join: 'Join in',
		verdictLabel: 'Last verdict',
		verdict: 'Marie wins +15 pts'
	},
	how: {
		eyebrow: 'How it works',
		title: 'Three steps, and no more \u201ctold you so\u201d.',
		steps: [
			{
				number: '01',
				title: 'Get the gang together',
				text: 'Create a group and share the link. Friends can even join as guests, no account needed.',
				icon: UsersRound
			},
			{
				number: '02',
				title: 'Start the bet',
				text: 'Pick the format, the points or the forfeit, who plays and who sits on the jury.',
				icon: MessagesSquare
			},
			{
				number: '03',
				title: 'The jury decides',
				text: 'Once the event has happened, the jury votes. The app updates the scores on its own.',
				icon: Gavel
			}
		]
	},
	formats: {
		eyebrow: 'The two formats',
		title: 'Two ways to compete.',
		intro:
			'One for guessing a number, one for betting on an outcome. Both play for points or forfeits.',
		closest: {
			tag: '01 — CLOSEST WINS',
			title: 'Closest guess',
			text: 'A number to find: the score, the number of beers, the temperature at midnight. Closest guess takes the pot, and answers stay hidden until the end.',
			example: '\u201cHow many goals tonight?\u201d'
		},
		challenge: {
			tag: '02 — CALL YOUR SHOT',
			title: 'Challenge',
			text: 'You predict Yes or No. Head to head, you negotiate the terms with your opponent. Open challenge, first to accept lock in the stake.',
			example: '\u201cWill Lucas finish the race in under 2 hours?\u201d'
		}
	},
	rules: {
		eyebrow: 'Competition without the arguments',
		title: 'The app keeps the rules and the score.',
		intro:
			'Everyone knows what was agreed, who votes and what the result changes. All that\u2019s left is the trash talk.',
		seal1: 'PLAY FOR POINTS',
		seal2: 'NOT MONEY',
		items: [
			{
				title: 'Points & leaderboard',
				text: 'Winnings feed the tab and the leaderboard of each group.'
			},
			{
				title: 'Memorable forfeits',
				text: 'Not into points? Swap the stake for a forfeit if you lose.'
			},
			{
				title: 'Jury verdict',
				text: 'Members picked in advance vote by majority or unanimously.'
			},
			{
				title: 'Just between you',
				text: 'You choose who sees and joins each bet. Nothing is public.'
			}
		]
	},
	faq: {
		title: 'Frequently asked questions about betting with friends',
		items: [
			{
				q: 'Is it really free?',
				a: 'Yes. No subscription, no credit card, no hidden premium tier. Create your group and play.'
			},
			{
				q: 'Is there real money involved?',
				a: 'No, never. Stakes are virtual points or forfeits: no real money bet ever goes through the app.'
			},
			{
				q: 'How do I make a bet with friends online?',
				a: 'Create a group, share the link, everyone drops a guess or takes on a challenge, and a jury picked in advance decides. The app keeps score with points or forfeits.'
			},
			{
				q: 'Can we bet on sports with this?',
				a: 'Yes: the score of a game, the goal scorer, the number of cards… or anything else (the weather, an exam, a TV show). You pick the question, the format and the stake.'
			},
			{
				q: 'Do my friends need an account?',
				a: 'Not necessarily. They can join as guests with the group link. An account comes in handy for history and leaderboards.'
			},
			{
				q: 'How is the winner decided?',
				a: 'You pick a jury in advance. Once the event has happened, they vote \u2014 by majority or unanimously \u2014 and the app updates everything.'
			},
			{
				q: 'Can people copy each other\u2019s answers?',
				a: 'No: answers stay hidden until the bet closes. Everyone plays at the same time.'
			}
		]
	},
	cta: {
		eyebrow: 'The next bet is yours',
		title: 'So, who was right?',
		text: 'Create your group in seconds and never let a \u201ctold you so\u201d go unproven again.'
	},
	footer: {
		claim: 'Gentle Wagers \u2014 Bets between friends, no real money.',
		note: 'Virtual points and forfeits only.'
	}
};
