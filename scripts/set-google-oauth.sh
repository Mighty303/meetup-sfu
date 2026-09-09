#!/usr/bin/env bash
# Prompts for the Google OAuth client credentials and writes them to .env.local
# and all three Vercel environments. The secret is read with -s so it never
# appears on screen or in shell history.
set -euo pipefail
cd "$(dirname "$0")/.."

printf 'Google OAuth client ID: '
read -r CLIENT_ID
printf 'Google OAuth client secret (hidden): '
read -rs CLIENT_SECRET
printf '\n'

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Both values are required." >&2
  exit 1
fi

# Replace any existing entries rather than appending duplicates.
if [ -f .env.local ]; then
  grep -v -E '^AUTH_GOOGLE_(ID|SECRET)=' .env.local > .env.local.tmp || true
  mv .env.local.tmp .env.local
fi
{
  printf '\n# Google OAuth\n'
  printf 'AUTH_GOOGLE_ID="%s"\n' "$CLIENT_ID"
  printf 'AUTH_GOOGLE_SECRET="%s"\n' "$CLIENT_SECRET"
} >> .env.local
echo "Wrote AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to .env.local"

if command -v vercel >/dev/null 2>&1; then
  AUTH_SECRET_VALUE=$(grep -E '^AUTH_SECRET=' .env.local | cut -d= -f2- | tr -d '"')
  for ENV in production preview development; do
    for KEY in AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET AUTH_SECRET; do
      vercel env rm "$KEY" "$ENV" --yes >/dev/null 2>&1 || true
    done
    printf '%s' "$CLIENT_ID"          | vercel env add AUTH_GOOGLE_ID "$ENV"     >/dev/null 2>&1
    printf '%s' "$CLIENT_SECRET"      | vercel env add AUTH_GOOGLE_SECRET "$ENV" >/dev/null 2>&1
    printf '%s' "$AUTH_SECRET_VALUE"  | vercel env add AUTH_SECRET "$ENV"        >/dev/null 2>&1
    echo "Set all three in Vercel $ENV"
  done
  echo
  echo "Now redeploy:  vercel --prod --yes"
else
  echo "vercel CLI not found; set the three vars in the dashboard yourself."
fi
