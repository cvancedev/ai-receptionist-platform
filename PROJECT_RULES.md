# Project Rules

The project charter and these project rules take priority over individual implementation requests unless the owner explicitly amends them.

1. Build one milestone at a time.
2. Do not begin the next milestone until the current one is stable.
3. Build only what is explicitly requested.
4. Do not introduce feature creep.
5. Do not redesign unrelated code.
6. Do not rename or reorganize files without a clear need.
7. Prefer the smallest durable solution.
8. Prefer clarity over cleverness.
9. Keep branding centralized and configurable.
10. Industry-specific workflows, terminology, services, and policies belong in the Business Profile, never in the platform core.
11. Separate UI, business logic, external services, data access, configuration, and shared types when those layers become necessary.
12. Do not create architecture merely to anticipate hypothetical future needs.
13. Do not add dependencies without explaining the need.
14. Preserve existing functionality.
15. Use accessible, responsive, professional design.
16. Avoid cheesy AI visuals, excessive gradients, cartoon robots, unnecessary animation, and visual clutter.
17. Never expose secrets in client-side code or commit secrets to Git.
18. Every completed milestone must pass:
    - `npm run lint`
    - `npx tsc --noEmit`
    - `npm run build`
19. Every completion report must list:
    - Files created
    - Files modified
    - Dependencies added or removed
    - Validation results
    - Unresolved issues
20. Do not use forced dependency fixes that introduce incompatible or outdated package versions.
21. Stop after completing the requested milestone.
