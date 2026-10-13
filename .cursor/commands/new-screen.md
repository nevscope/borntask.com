# New screen

Build the screen I name using the BornTask design system. Do not regenerate My tasks, List, Board, Task drawer or Quick add.

1. Read `apps/web/docs/design/INDEX.md` and the matching `.dc.html` spec, plus `.cursor/rules/borntask-*.mdc`.
2. Before coding, list: the page's one primary action, kit components you will reuse, any new component, and the query keys required.
3. Build with Ant Design themed by `apps/web/src/theme/antdTheme.ts` and hooks in `apps/web/src/api/queries.ts`.
4. Handle loading, empty, error and partial states.
5. Run `npm run design:lint` before you say you are done.
