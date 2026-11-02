const res = await fetch('http://100.88.54.21:4173/en/claim');
const body = await res.text();
console.log('HTTP', res.status);
const text = body
	.replace(/<head>[\s\S]*?<\/head>/i, ' ')
	.replace(/<script[\s\S]*?<\/script>/gi, ' ')
	.replace(/<[^>]+>/g, '|')
	.replace(/\s+/g, ' ');
let idx = 0;
while ((idx = text.indexOf('Se connecter', idx)) !== -1) {
	console.log('CONTEXTE:', text.slice(Math.max(0, idx - 120), idx + 60));
	idx += 12;
}
