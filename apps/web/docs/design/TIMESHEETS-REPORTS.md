# Timesheets, days off and reports: screen designs

These are the mocks for the "Workspace reports page" plan (`workspace_reports_page.plan.md`), **plus days off and public holidays**, which the plan didn't cover. They come from the BornTask Screens canvas, row 12.

## Files

| File | Build as | Plan to-do |
|---|---|---|
| `Timesheets.dc.html` | `apps/web/src/screens/TimesheetsScreen.tsx`, route `/timesheets`, sidebar link under My tasks | screen-timesheets, **days-off** |
| `SheetTimesheets.dc.html` | Variants and states of the same screen (not a separate page) | screen-timesheets, days-off, tests-gates |
| `Reports.dc.html` | `WorkspaceReportsScreen`, route `/reports`, sidebar under Timesheets (members see their own work; owner/admin see the workspace). `/settings/reports` redirects here. | screen-reports, queries-nav |
| `WorkspaceGeneral.dc.html` | The **Timesheets** section in `WorkspaceGeneralScreen.tsx`: period, unit, **working days**, **public holidays** | schema-settings, **holidays** |

## How to read a `.dc.html`

- **Layout and copy:** the markup between `<x-dc>` and `</x-dc>`. `{{name}}` is a value from `renderVals()` in the script at the bottom. `<sc-for>` repeats a block; `<sc-if>` shows it conditionally.
- **Behaviour:** the script shows how the screen works. On Timesheets, the day-menu rules (`canMark`, `hasTime`, `isWeekend`) and the totals maths are the spec.
- **Sample data:** realistic fixtures. Every total reconciles, so reuse them in tests: 659:30 logged; 4 complete, 2 partial, 1 none; 25 missing days; 7 days off; 48 opened, 41 closed, 63 open, 7 overdue.
- **Translate, don't paste:** build with Ant Design 6 and the theme tokens. Don't copy the inline styles or hex colours (`design:lint`).

## Additions to the plan

### New to-dos

```yaml
- id: days-off
  content: "TimesheetDayOff model; day menu on /timesheets (Leave | Other, optional note); weekly-mode days-off count; Reports expected-days maths"
- id: holidays
  content: "Workspace workingDays + WorkspaceHoliday; Public holidays list in General settings (year, add, remove, copy to next year)"
```

### Data model

- **`Workspace.workingDays`:** for example `["mon","tue","wed","thu","fri"]` (the default).
- **`WorkspaceHoliday`:** `tenantId`, `date`, `name`. Unique on `(tenantId, date)`. Owner and admin write.
- **`TimesheetDayOff`:** `tenantId`, `userId`, `date`, `kind` (`leave` | `other`), `note?`. Unique on `(tenantId, userId, date)`. In weekly mode, store one row per day off. The UI asks for a count, and the server assigns the days to the first working, non-holiday days of that week.
- **Kept separate from `TimesheetEntry`,** because a day off has no project.

### API

- **`GET /timesheets?from=&to=&userId=`** also returns `daysOff[]` and `holidays[]` for the range.
- **`PUT /timesheets/days-off`:** upsert or delete your own rows. Refused (409) when the day already has time logged, or when the date isn't a working day.
- **`GET/PUT /workspace/holidays?year=`:** owner and admin only. `POST /workspace/holidays/copy {from, to}` copies fixed dates to the next year.

### Rules

- **Who can mark a day off:** only the person, and only for a working day with no time logged. Future dates are allowed, so leave can be planned.
- **Public holidays:** apply to everyone automatically. Time can still be logged on a holiday and counts as extra.
- **Visibility:** anyone who can read a timesheet sees **"Off"**. The kind and note are visible only to the person, owners and admins.
- **Kinds are Leave and Other only. Don't add "Sick":** project leads can read timesheets, and a sick label would spread health information.
- **No approval workflow;** days off are self-declared, as in v1.
- **No MCP tools for days off or holidays.**

### Reports maths (replaces "missing days")

```
expected days = working days in range (up to today) - workspace holidays - person's days off
complete      = days with any time logged == expected days
missing days  = expected days - days with time logged
```

- The person × project table gains an **Off** column and shows **Logged / expected**.
- Tiles: Complete, Missing days, **Days off**.
- The missing-timesheets list only counts expected days.

## Screen behaviour

### Timesheets
- **Header:** the subtitle states the workspace mode. Controls are Copy last week, Previous / This week / Next, and the autosave status.
- **Tiles:** this week, today, last week, **days logged of expected**, **days off this week**.
- **Grid:** rows are the projects you're on. Columns are Mon–Sun in daily mode, with today highlighted. Row and day totals update as you type `2:30` or `2.5`.
- **Day menu (click a day header):**
  - **Working day, no time:** "Mark as day off: Leave / Other".
  - **Working day with time:** an explanation instead of the option.
  - **Day off:** "Back to a working day".
  - **Weekend:** "not a working day" text.
- **A day marked off:** a header tag "Off: Leave", locked cells showing "Off", and the day total reads "Leave".
- **A holiday column:** a blue header "Public holiday" and cells reading "Holiday" until someone types time.
- **Notes:** clicking a filled cell opens the note popover. A dot marks cells with a note.

### Variants (SheetTimesheets)
- **Settings combinations:** weekly percentage (warn if not 100%, still save), weekly time with notes, daily percentage with a short day flagged.
- **Notes:** the cell-note popover.
- **Days off:**
  - Marking a day off: the menu, then the resulting header.
  - A day that already has time, and a weekend menu.
  - A public holiday in the grid.
  - Weekly-mode days-off count.
- **Lead view:** a read-only "Viewing" picker. Days off show as "Off" only.
- **Other states:** the banner after a unit switch, guest/viewer, no projects, and the who-sees-what table.

### Reports
- **Filters:** period (This week / This month (default) / Last month / Custom…) and project. The range line notes any public holidays.
- **Tasks:** the tiles and tables as before.
- **Timesheets:** tiles (time logged, people with time, complete, missing days, days off); a person × project table with Off and Logged / expected; time by project; missing timesheets (expected days only).
- **Charts:** none. Bars are plain CSS.

### Workspace general
- **Timesheet settings:** "Each entry covers" (A day / A week) and "People enter" (Time / Percentage).
- **Working days:** day chips, Mon–Fri on by default.
- **Public holidays:** a year picker, "+ Add holiday", the upcoming list with Remove, and "Show all". "Copy to 2027" carries fixed dates; check movable ones like Good Friday.
- **Explanatory note:** saved entries keep their unit, and days off are marked on Timesheets.

## Decisions taken in the mocks (confirm or change)

1. **Daily mode shows a week grid**, one cell per day.
2. **Working days are a workspace setting** (default Mon–Fri). **Per-person working patterns for part-timers are not included**; add them later in People and invitations if needed.
3. **A day can't be both worked and off.** Time must be cleared first.
4. **Days off are self-declared, with no approval.** Leads see "Off" without the kind or note.
5. **Leads read others' time through a "Viewing" picker** on `/timesheets`, filtered to the projects they lead.
6. **"Time to start"** is the first move into an active or review category status.
7. **Copy uses hyphens only.**

## Navigation

- **Main sidebar:** a **Timesheets** link under My tasks.
- **Settings menu:** **Reports** under Workspace, after Billing.
