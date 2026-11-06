# QA UI pass checklist

Use with the `qa-ui-pass` skill. Tick in the audit log, not by editing this file.

## Environment

- [ ] Web up (prefer http://localhost:5174, `VITE_USE_MOCKS=false`)
- [ ] API up on 3010
- [ ] Record the URL actually used
- [ ] Theme: light pass, then dark pass (or the reverse). `localStorage bt-theme`

## Viewports

- [ ] 14-inch laptop **1536 × 864**
- [ ] 14-inch tight **1366 × 768**
- [ ] Phone **390 × 844** (`mobile: true`)

## Brand (spot-check each viewport and theme)

- [ ] Body `DM Sans`, h1 `Sora`
- [ ] Light: `--bt-brand` `#178A5C`, primary button about `rgb(21, 132, 90)`
- [ ] Dark: `--bt-brand` `#2FB57A`, canvas not `#000000`
- [ ] No `#ffc629` / saffron
- [ ] No emoji in chrome
- [ ] Copy uses hyphen `-`, not em/en dash
- [ ] British English (organisation, colour, authorised if those words appear)

## Desktop / 14-inch (both laptop sizes)

- [ ] `/` My tasks: filters, assigned list, last viewed does not duplicate the assigned row
- [ ] `/p/WEB/list`: Key through Priority usable; if it cannot fit, horizontal scroll inside the list, never width 0
- [ ] Filter / Group / Sort / Columns usable (wrap is OK; overlap is not)
- [ ] `/p/WEB/board`: all status columns reachable by in-board scroll
- [ ] Open `?task=WEB-1`: drawer ~600px, no full-page mask; Board / sidebar still clickable
- [ ] Search `checkout` or a known key
- [ ] `/views`, `/timesheets`, `/reports`
- [ ] Q from a settings route: default project is last viewed or favourite, not a random other project; Esc; no create
- [ ] Notifications panel fits

## Phone

- [ ] Sidebar hidden; tabs My tasks, Projects, Inbox, You; FAB for new task
- [ ] Board: every status chip reachable (including On hold, Rejected)
- [ ] Task sheet: hide tabs + FAB; next-step buttons do not cover description toolbar; Comment clickable
- [ ] Timesheets: today in view; rest of week obviously scrollable
- [ ] Duplicate page title (top bar + h1) is P3 only

## Rights

Dev-login. Restore owner at the end.

| Account | Must see | Must not |
|---|---|---|
| `owner@borntask.com` | All admin settings, billing, people | - |
| `qa.ts.member@borntask.com` | Own reports, timesheets, projects they are on | Billing, workspace general (URL and nav), other people's report totals, projects they are not on |
| `guest@qa.borntask.test` | Invited projects, guest banner | Timesheets, Reports, Projects index (or create), People, Billing; `/p/QTL/list` NoAccess |

- [ ] Last viewed is per user (member/guest do not inherit the owner's list)

## Do not

- Patch code
- Leave a new task, invite, or workflow stage
- Treat a screenshot of a cropped Cursor pane as a 14-inch pass
