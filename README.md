# Criterial

Independent analytical firm focused on the Spanish private investment market.

This repository contains the MVP system: public website, Supabase Edge Functions, content generation prompts, and operational scripts.

> **For contributors and agents:** `CLAUDE.md` is the internal technical and operational reference for Claude Code and other agents. This README is a concise public-facing overview.

---

## About

Criterial operates two active business lines:

- **Advisory** — analytical work on demand: company valuations, sector analysis, and pitch decks.
- **Criterial Signals** — editorial intelligence product delivering weekly digests and monthly briefs on M&A, real estate, and capital markets in Spain.

---

## Criterial Signals

Weekly and monthly briefs covering deal activity, competitive moves, real estate transactions, and capital markets signals in the Spanish private investment market.

Free and Pro plans are available. See the [pricing page](https://criterialsignals.com/pricing.html) for current terms.

---

## Advisory

On-demand analytical services for investment professionals and firms:

- Company valuations
- Sector analysis
- Pitch deck preparation

Enquiries via [criterialsignals.com/encargos.html](https://criterialsignals.com/encargos.html).

---

## Website

[https://criterialsignals.com](https://criterialsignals.com)

---

## Stack

- **Frontend:** static HTML/CSS hosted on GitHub Pages (repository root)
- **Database and backend:** Supabase (PostgreSQL, Auth, Edge Functions)
- **Content generation:** Anthropic API
- **Email:** Resend
- **Payments:** Stripe
- **Legacy automation:** Make/Integromat flows are deactivated; active flows run through Supabase Edge Functions.

---

## Repository layout

```
/
├── *.html          ← public website (repository root)
├── styles.v4.css
├── criterial-shared.js
├── /supabase
│   ├── /functions  ← Edge Functions (TypeScript/Deno)
│   └── /migrations
├── /prompts        ← content generation prompts
└── /scripts        ← operational scripts
```

---

© Criterial. All rights reserved.
