#!/usr/bin/env bash
#
# build-cf-public.sh — assemble public/ for Cloudflare Pages.
#
# The static site is a flat set of files that live at the REPO ROOT (that is
# also what GitHub Pages serves as the fallback during the migration). This
# script copies ONLY the files the site actually serves into public/, so that
# Cloudflare Pages never exposes supabase/, scripts/, prompts/, docs/,
# archive/*.zip, CLAUDE.md, etc.
#
# It is an ALLOWLIST: adding a new page means adding it here on purpose. That
# is the safety property — nothing internal leaks by accident.
#
# public/ is generated, never committed (see .gitignore).
#
# Cloudflare Pages settings:
#   Framework preset       : None
#   Build command          : bash scripts/build-cf-public.sh
#   Build output directory : public
#
set -euo pipefail

# Run from the repo root regardless of the caller's working directory.
cd "$(dirname "${BASH_SOURCE[0]}")/.."

rm -rf public
mkdir public

# --- Site pages (14) -------------------------------------------------------
cp -t public/ \
  index.html \
  about.html \
  pricing.html \
  sample.html \
  muestra.html \
  signals.html \
  archive.html \
  encargos.html \
  advisory-received.html \
  request-received.html \
  success.html \
  cancel.html \
  admin.html \
  admin-v2.html

# --- Assets (2) ----------------------------------------------------------
# When styles.vN is bumped (cache-bust dance, CLAUDE.md §7) update this line.
cp -t public/ \
  styles.v13.css \
  criterial-shared.js

# --- Optional files, copied only once they exist (later phases) ----------
#   _headers      security headers          (plan Fase 2)
#   _redirects    clean URLs / redirects
#   robots.txt    SEO                        (plan Fase 8)
#   sitemap.xml   SEO                        (plan Fase 8)
#   404.html      custom not-found page
for f in _headers _redirects robots.txt sitemap.xml 404.html; do
  [ -f "$f" ] && cp "$f" public/ || true
done

echo "public/ built — $(find public -type f | wc -l) file(s):"
( cd public && find . -type f | sed 's|^\./||' | sort )
