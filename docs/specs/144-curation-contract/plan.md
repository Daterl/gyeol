# #144 backend completion plan

Scope: preserve existing curation/order and PR154 changes; finish browser connection and G4 → generate → G5 handoff without modifying UI or invoking paid providers.

1. Merge latest origin/develop; inspect ADR-0008/0005 and existing cache/generation contracts.
2. Send exact browser contract to coordinator before implementation: anonymous signed HttpOnly cookie, session-bound CSRF, exact configured HTTPS origin, durable global limits and retained bearer automation.
3. Implement server helpers and profile bootstrap route; isolate durable quota records from profile cleanup with bounded reused keys and bounded CAS attempts.
4. Cover adversarial authorization/origin/cookie/CSRF and concurrent/ambiguous storage outcomes with provider-not-called assertions.
5. Add checked-in 3/15 × blank/written prompt fake-provider fixture spanning feed → generation → G5, preserving seed/omitted, IDs and provenance.
6. Run focused and full checks, build/bundle scan and local smoke; update schema/report, commit with Lore trailers and push existing Draft PR153. Coordinator owns UI integration, independent review and live Preview gates.
