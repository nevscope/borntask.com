# Mobile phone QA log

Date: 28 Oct 2026  
Viewport: 390×844, `useIsPhone` / `max-width: 767px`  
App: `http://localhost:5174` (live API, workspace with ANO, TES, WEB)

Do not treat this as fixed. This chat only logged issues.

## Reported by user (confirmed)

### P1 - Comment `@` mention picker is missing on phone

- Reproduce: open a task on phone width (`WEB-2`), type `@` in the bottom **Comment…** field.
- Result: `@` is inserted as plain text. No people list. No mention toolbar on the comment field.
- Cause: phone comments use `PhoneMoveBar` (`apps/web/src/components/TaskDrawer.tsx`), a plain Ant Design `Input`. Desktop comments use `DescriptionEditor` with TipTap mention suggestions.
- Phone also sets `hideComposer={isPhone}` so the real comment composer (with mentions) is not shown.
- `PhoneMoveBar` posts `draft.trim()` as raw text, not `persistDescription()` HTML, so even a typed `@Name` is not a structured mention.

### P1 - Projects list does not put favourites first

- Reproduce: `/projects` with Website starred, Another test and Test not starred.
- Result: order is ANO, TES, WEB. Starred Website is last.
- Cause: `ProjectsScreen` maps `live.data` as returned. No `starred` sort. Sidebar already pins favourites; the Projects page does not.

### P1 - Back does not close the task (or other open windows)

- Reproduce: open a task on phone (list row → drawer). Tap the in-app Back chevron, or use the browser / Android back control.
- Result (user): the task stays open. Back does not reliably dismiss the drawer.
- Expected: every overlay that opens must close on Back, in this order: innermost first (picker, confirm, preview, inbox, quick add), then the task drawer. Only after those are gone should Back leave the project or the app.
- Cause notes:
  - In-app Back (`aria-label="Back"` in `TaskDrawer`) calls `requestClose()`. If `guard.dirty` is true (typed comment or subtask), it opens **Discard unsent text?** instead of closing. Easy to look like Back is broken.
  - The drawer is URL-driven (`?task=` via `useTaskParam` / `setSearchParams`). There is no `popstate` / history stack for overlays. Device Back often leaves the list or the project instead of closing the drawer.
  - Inbox sheet, You sheet, Quick add, attachment preview, filter/group menus, and confirm dialogs also do not push history, so system Back cannot close them.
- Rule: one Back tap = close the topmost open window. Do not navigate away while a drawer or sheet is still open.

### P1 - Always-visible Completed on phone list rows

- Reproduce: project list on phone (`/p/WEB/list`).
- Result: every row shows **Completed** (`aria-label` `Mark WEB-* as completed`).
- Cause: compact `ListFields` renders `<CompleteTick always … />`. CSS `.bt-complete.always` forces `opacity: 1; pointer-events: auto`. Desktop only shows the control on row hover.
- Easy accidental tap while opening a task or changing status.

### P1 - Completed shows over Copy / Copy link on the list row

- Fixed 28 Oct 2026: `.bt-complete-slot` is in-flow (102px), not a 0-width absolute overlay. Compact rows no longer render `CompleteTick` next to Copy.
- Reproduce (was): project list (`/p/WEB/list`). Desktop hover or phone compact.
- Cause (was): desktop `CompleteTick` in `.bt-complete-slot` (`width: 0`, absolute `right: 6px`) painted over **Copy**.

## Other issues found in the same pass

### P2 - Project chrome is too dense on phone

- Header still shows List, Board, Trash, Members, Sections plus Filter, Group, Sort, Columns, Save view.
- Horizontal crowding; easy mis-tap. `ProjectHeader` is not phone-simplified.

### P2 - Task drawer: Copy link and Copy sit together

- Phone drawer header: Watch, Copy link, Copy (duplicate task). Easy to hit the wrong one.

### P2 - Fail / Pass sit under the comment field

- Testing tasks show **Fail · WIP** and **Pass · Deployed** directly under Comment. Same accidental-tap risk as Completed.

### P3 - Comments thread composer hidden on phone

- Existing comments can be read, but there is no mention-capable composer in the Comments section. All new comments go through `PhoneMoveBar`.

### P3 - Phone comment cannot attach via paste

- Desktop comment composer accepts paste-to-attach. Phone bar does not.

### Note - My tasks

- Phone My tasks rows do not show Completed (good). Issue is project list compact rows only.

## Suggested fix chat prompt

```
Fix the phone issues in mobile-phone-qa-log.md.

Priority:
1. Phone task comments: @ must open the same mention picker as desktop. Use DescriptionEditor (or equivalent) in PhoneMoveBar; persist via persistDescription; do not hide mentions on phone. Verify people appear when pressing @.
2. Projects screen: show starred favourites first, then the rest (keep existing card UI).
3. Hide the Completed control on phone list rows (do not use CompleteTick always). Completing a task on phone should stay a deliberate action (status menu or task drawer), not a thumb-sized button on every row.
4. Completed must not paint over Copy / Copy link. Stop using a 0-width absolute `.bt-complete-slot` that overlaps the Copy control. Give the chip its own space, or show it only in the fields column.
5. Back must close whatever is open: task drawer, quick add, inbox, You sheet, previews, dialogs, pickers. Device/browser Back and the in-app Back chevron. Do not leave the list while a window is still open.

Also fix if cheap: denser project header/nav on phone; Copy vs Copy link collision; Fail/Pass sitting under the comment field.

British English. Hyphen only. Tokens only. Verify on a 390-wide viewport in the browser. Run typecheck and design:lint.
```
