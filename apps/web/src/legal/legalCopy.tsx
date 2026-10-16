import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { color } from '../theme/tokens';

export const LEGAL_UPDATED = '16 October 2026';
export const PRIVACY_CONTACT = 'notify@borntask.com';

export type LegalKind = 'privacy' | 'terms';

export type LegalSection = { title: string; body: ReactNode };

function A({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} style={{ color: color.brandStrong, fontWeight: 500, textDecoration: 'none' }}>
      {children}
    </Link>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={{ color: color.brandStrong, fontWeight: 500, textDecoration: 'none' }}>
      {children}
    </a>
  );
}

export function legalTitle(kind: LegalKind): string {
  return kind === 'privacy' ? 'Privacy notice' : 'Terms of use';
}

export function legalIntro(kind: LegalKind): string {
  return kind === 'privacy'
    ? 'How BornTask uses personal data under EU and Maltese law. This notice describes the product as it works today.'
    : 'The rules for using BornTask. By signing in or creating a workspace you agree to these terms.';
}

export const privacySections: LegalSection[] = [
  {
    title: 'Who we are',
    body: (
      <>
        <p>
          BornTask is a multi-tenant task tracker at app.borntask.com. The service is operated from Malta, so the EU General Data Protection Regulation (GDPR) and the Maltese Data Protection Act apply.
        </p>
        <p>
          The controller for account data (your name, email, sign-in identifiers and notification preferences) is the operator of BornTask. For task content, comments, files and workspace membership, your workspace is the customer. We process that content to provide the service.
        </p>
        <p>
          Privacy requests: <Ext href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</Ext>. If we later publish a registered company name and address, they will appear on this page.
        </p>
      </>
    ),
  },
  {
    title: 'What BornTask does',
    body: (
      <>
        <p>
          BornTask helps teams move work from idea to done. You create workspaces and projects, write tasks (ideas, bugs, improvements and features), comment, attach files, watch work, and move tasks through a workflow with role rules. Soft-deleted tasks stay in Trash for 30 days.
        </p>
        <p>
          You can invite people, import from Asana, connect GitHub, post to Google Chat, and let assistants such as Claude or Cursor act as you through MCP or a personal API token.
        </p>
      </>
    ),
  },
  {
    title: 'Data we store',
    body: (
      <>
        <p>We store only what the product needs. Workspace rows are isolated by tenant.</p>
        <ul>
          <li>
            <strong>Account.</strong> Name, email, optional avatar, Google or Microsoft provider id, time zone, digest setting, when the account was created.
          </li>
          <li>
            <strong>Workspace and access.</strong> Workspace name, slug, logo, defaults, allowed email domains, membership and roles, invitations (including the invited email), access requests.
          </li>
          <li>
            <strong>Work.</strong> Projects, sections, labels, task titles and descriptions, type, status, priority, dates, estimates, assignees, reporters, watchers, comments and @mentions, activity history, saved views and favourites.
          </li>
          <li>
            <strong>Files.</strong> Attachment name, size, type and the file itself under our blob store (not a public file host). Uploads are limited to 25 MB. Import files are stored while an Asana import runs.
          </li>
          <li>
            <strong>Notifications.</strong> In-app notification records and your channel preferences (in app, email, Google Chat).
          </li>
          <li>
            <strong>Security tokens.</strong> Hashed personal API tokens and OAuth grants (app name, host, scope, last used). The raw token is shown once and is not stored in plain text.
          </li>
          <li>
            <strong>Integrations.</strong> Encrypted Google Chat webhook URLs, Chat event prefs, GitHub installation and repo links, branch and pull-request references on tasks, GitHub event log text, automation rules.
          </li>
          <li>
            <strong>Operations.</strong> A signed session cookie, job queues in Redis, and server logs needed to run and debug the service.
          </li>
        </ul>
        <p>We do not sell personal data. We do not run advertising or product-analytics cookies in the app today.</p>
      </>
    ),
  },
  {
    title: 'How we collect it',
    body: (
      <>
        <p>You give us data when you sign in, create a workspace, type into tasks, upload files, invite people, or connect an integration.</p>
        <p>
          Google or Microsoft send us the profile we need to create a session (typically name, email and a stable provider id). GitHub sends installation, repository and pull-request events you chose to connect. Google Chat sends slash commands and message actions when someone uses the BornTask Chat app. Imported Asana rows become tasks and people references in your workspace.
        </p>
      </>
    ),
  },
  {
    title: 'Why we use it (legal bases)',
    body: (
      <ul>
        <li>
          <strong>Contract.</strong> To run the workspace you asked for: sign-in, tasks, files, workflow, invitations, billing records when payments go live.
        </li>
        <li>
          <strong>Legitimate interests.</strong> To keep the service secure, prevent abuse, debug failures, and improve reliability. We balance this against your rights.
        </li>
        <li>
          <strong>Consent.</strong> Optional channels such as Google Chat DMs or a personal Chat webhook, and connecting GitHub or an MCP client. You can disconnect those at any time.
        </li>
        <li>
          <strong>Legal obligation.</strong> To keep invoices and similar records when billing is connected, and to answer lawful requests.
        </li>
      </ul>
    ),
  },
  {
    title: 'Integrations and processors',
    body: (
      <>
        <p>These parties process data when you (or your workspace) use the matching feature. Each has its own terms.</p>
        <ul>
          <li>
            <strong>Google.</strong> Sign-in (OIDC). Optional Google Chat: project space webhooks, the BornTask Chat app (create and move tasks as the mapped user), and personal DMs or a fallback webhook. Chat is matched by the same email you use to sign in.
          </li>
          <li>
            <strong>Microsoft.</strong> Sign-in (OIDC), often used for guest accounts.
          </li>
          <li>
            <strong>GitHub.</strong> A GitHub App installation you connect to a project. We store installation id, account, linked repos, and development links (branch, pull request, commit) on tasks.
          </li>
          <li>
            <strong>SendGrid.</strong> Transactional email from notify@borntask.com: invitations, wrong-account notices, and the daily digest if you leave email on. SendGrid is a US processor; we rely on their GDPR terms and Standard Contractual Clauses.
          </li>
          <li>
            <strong>MCP and API clients.</strong> Tools you authorise (for example Claude or Cursor) act as you, with your projects and the same workflow rules. They cannot delete tasks, change workspace settings or invite people. You revoke access under <A to="/settings/tokens">API tokens and MCP</A>.
          </li>
          <li>
            <strong>Hosting.</strong> The app, MySQL database, Redis job queues and attachment files run on the infrastructure we use for app.borntask.com.
          </li>
        </ul>
        <p>
          Connecting an integration shares the minimum needed for that feature (for example a task title and link in Chat, or a branch name in GitHub). Workspace members can see work you put in shared projects.
        </p>
      </>
    ),
  },
  {
    title: 'Cookies',
    body: (
      <p>
        We set one first-party session cookie so you stay signed in. It is HTTP-only, SameSite Lax, and Secure in production. It is necessary for the service. We do not set advertising or analytics cookies. OAuth sign-in also uses a short-lived signed state parameter so the provider can return you to BornTask.
      </p>
    ),
  },
  {
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Your account and workspace data last while the workspace is active.</li>
        <li>Trash: soft-deleted tasks can be restored for 30 days, then they are purged.</li>
        <li>Workspace deletion (owner only): the workspace and its projects, tasks and files are removed after 30 days.</li>
        <li>Invitations expire; revoked tokens and grants stay only as a revoked record.</li>
        <li>Session cookies end when you sign out or the session expires.</li>
        <li>Email and Chat delivery logs are kept only as needed to send and debug those messages.</li>
      </ul>
    ),
  },
  {
    title: 'Your rights',
    body: (
      <>
        <p>
          Under the GDPR you may request access, correction, erasure, restriction, portability, and to object to processing based on legitimate interests. You may withdraw consent for optional integrations without affecting sign-in to the core product.
        </p>
        <p>
          You can complain to the Information and Data Protection Commissioner in Malta (
          <Ext href="https://idpc.org.mt">idpc.org.mt</Ext>
          ), or to your local EU supervisory authority.
        </p>
        <p>
          In the app you can already: edit your name and notification choices under <A to="/settings/profile">Profile and notifications</A>; disconnect Chat and revoke tokens under the same settings and <A to="/settings/tokens">API tokens and MCP</A>; leave or ask an owner to remove you; ask an owner to delete the workspace.
        </p>
        <p>
          A self-serve export of every personal record is not built yet. Email {PRIVACY_CONTACT} and we will handle the request by hand.
        </p>
      </>
    ),
  },
  {
    title: 'Children',
    body: (
      <p>
        BornTask is aimed at work teams. Do not create an account for anyone under 16. If we learn that we hold such an account, we will close it.
      </p>
    ),
  },
  {
    title: 'Changes',
    body: (
      <p>
        If we change this notice in a material way we will update the date at the top and, where the change is significant, tell workspace owners in the product or by email.
      </p>
    ),
  },
];

export const termsSections: LegalSection[] = [
  {
    title: 'The service',
    body: (
      <p>
        BornTask is software for planning and tracking work: projects, tasks, comments, files, workflow rules, invitations, search, and optional integrations (Google Chat, GitHub, Asana import, MCP and personal API tokens). We host it at app.borntask.com. Features may change as we ship.
      </p>
    ),
  },
  {
    title: 'Who may use it',
    body: (
      <>
        <p>
          You must be able to form a contract and, if you are signing in for an organisation, have authority to bind that organisation. You sign in with Google or Microsoft. A first sign-in with no workspace lets you create one. Invitations add teammates and guests.
        </p>
        <p>
          Workspace owners and admins control who may join, which sign-in providers are allowed, and guest invites. You must keep your account and tokens to yourself.
        </p>
      </>
    ),
  },
  {
    title: 'Your content and responsibility',
    body: (
      <>
        <p>
          You (and your workspace) own the content you put in BornTask. You grant us a limited licence to host, display, back up and transmit that content so the product works, including through integrations you switch on.
        </p>
        <p>
          You must have the right to upload what you upload. Do not use BornTask for unlawful content, malware, or to infringe other people&apos;s rights. Workflow rules, comments and @mentions are visible to people with access to that project.
        </p>
      </>
    ),
  },
  {
    title: 'Acceptable use',
    body: (
      <ul>
        <li>Do not probe, scrape or overload the service beyond normal product use.</li>
        <li>Do not bypass tenant isolation, workflow rules or permission checks.</li>
        <li>Do not share personal API tokens or session cookies.</li>
        <li>Do not use MCP or tokens to take actions the signed-in user could not take in the app. MCP cannot delete tasks, change settings or invite people.</li>
        <li>Respect the people you invite and the data in shared projects.</li>
      </ul>
    ),
  },
  {
    title: 'Integrations',
    body: (
      <p>
        Optional connections (Google Chat, GitHub, email via SendGrid, MCP clients) are provided as-is and depend on those providers. We are not responsible for outages or policy changes on their side. You can disconnect Chat, revoke GitHub, revoke tokens and turn email events off in settings. Creating tasks from Chat still follows the same move rules as the app.
      </p>
    ),
  },
  {
    title: 'Price',
    body: (
      <p>
        The published price is €1 per paid member per month plus VAT. Owners, admins, members and viewers count; guests are free. Card collection is not connected yet; when it is, owners and admins will manage it under Billing. People added mid-month are charged for the remaining days; removals are credited on the next invoice.
      </p>
    ),
  },
  {
    title: 'Availability and changes',
    body: (
      <p>
        We aim to keep BornTask available but do not promise uninterrupted service. We may modify or withdraw features. Planned maintenance and incidents will be handled as reasonably as we can.
      </p>
    ),
  },
  {
    title: 'Liability',
    body: (
      <p>
        The service is provided as-is. To the extent allowed by Maltese and EU law we are not liable for lost profits, lost data you can restore from your own copies, or indirect loss. Nothing in these terms limits liability for death or personal injury caused by negligence, fraud, or any liability that cannot be limited by law. If a cap applies, it is the fees paid for the workspace in the three months before the claim.
      </p>
    ),
  },
  {
    title: 'Suspension and closure',
    body: (
      <p>
        We may suspend an account that breaches these terms or threatens the service. You may stop using BornTask at any time. A workspace owner may delete the workspace; deletion completes after 30 days. We may delete unused or abusive workspaces after notice where we can reach an owner.
      </p>
    ),
  },
  {
    title: 'Law',
    body: (
      <p>
        These terms are governed by the laws of Malta. Courts of Malta have jurisdiction, without limiting any mandatory consumer protection rights you have in your EU member state. The EU privacy notice is at <A to="/privacy">/privacy</A>.
      </p>
    ),
  },
  {
    title: 'Changes to these terms',
    body: (
      <p>
        We may update these terms. The date at the top will change. Continued use after a material update means you accept the new terms, except where the law requires a clearer agreement.
      </p>
    ),
  },
];

export function sectionsFor(kind: LegalKind): LegalSection[] {
  return kind === 'privacy' ? privacySections : termsSections;
}
