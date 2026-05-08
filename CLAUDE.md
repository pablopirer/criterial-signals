## Current roadmap

- **Day 1:** Complete.
- **Day 2:** Complete. Edge Function deployed and validated. Resend deferred.
- **Day 3:** Versioned prompts directory. Recurring content engine (weekly digest cron).
- **Day 4:** Authenticated access to publications via Supabase Auth + Row-Level Security. Update `/web/archive.html` to render real content for subscribers. Cutover web form from Make to Edge Function.
- **Day 5:** End-to-end test harness. Observability script for funnel metrics.

## Rules and restrictions

1. **Do not modify production database schema directly.** All schema changes go through SQL migrations under `/supabase/migrations`.
2. **Do not deactivate Make scenarios until Day 4.** Make is still the live orchestrator for the web form.
3. **Do not modify `/web` HTML files until Day 4.**
4. **Do not commit secrets.**
5. **Do not invent business logic.**
6. **Do not change Stripe configuration via code.**
7. **Always show a plan before executing destructive operations.**
8. **Use `git mv` to move files.**
9. **When in doubt about scope, ask.**

## Useful commands reference

```bash
supabase status
supabase db push
supabase functions deploy <name>
supabase secrets list
supabase secrets set KEY=value
git add . && git commit -m "message" && git push
```

## Contact and ownership

This project is owned and operated by Pablo Pirer.
EOF