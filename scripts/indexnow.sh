#!/usr/bin/env bash
# Soumission IndexNow — prévient Bing, Yandex, Seznam & co d'une nouvelle URL
# à indexer (l'équivalent « Bing » de la Search Console Google).
#
# Usage : ./scripts/indexnow.sh [url ...]   (par défaut : les 2 pages publiques)
set -euo pipefail

KEY="90abaf58ba737e2c70f28224f24b9df3"
HOST="gentlewagers.com"

URLS=("$@")
if [ ${#URLS[@]} -eq 0 ]; then
	URLS=("https://$HOST/" "https://$HOST/en")
fi

payload=$(printf '{"host":"%s","key":"%s","keyLocation":"https://%s/%s.txt","urlList":[' "$HOST" "$KEY" "$HOST" "$KEY")
for u in "${URLS[@]}"; do
	payload+="\"$u\","
done
payload="${payload%,}]}"

code=$(curl -s -o /dev/null -w '%{http_code}' \
	-H 'Content-Type: application/json; charset=utf-8' \
	-d "$payload" \
	'https://api.indexnow.org/indexnow')

echo "IndexNow => HTTP $code (200/202 = accepté)"
