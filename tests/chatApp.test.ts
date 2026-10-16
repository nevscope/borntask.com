import { describe, expect, test } from 'vitest';
import { interpretChatEvent, parseSlashCommand } from '../packages/shared/src/chat.ts';
import { applyIdeaCardAction, handleChatAppEvent, type ChatAppDeps } from '../apps/api/src/lib/chatApp.ts';
import type { Authed } from '../apps/api/src/context.ts';

const actor = { user: { email: 'daniela@scopecloud.example' } };

function slashEvent(text: string) {
  return {
    type: 'MESSAGE',
    user: actor.user,
    message: { text, argumentText: text.replace(/^\/borntask\s+/i, '') },
  };
}

describe('slash parse', () => {
  test('parses /borntask bug WEB title', () => {
    expect(parseSlashCommand('/borntask bug WEB Checkout button hidden on iPhone SE')).toEqual({
      type: 'bug',
      projectKey: 'WEB',
      title: 'Checkout button hidden on iPhone SE',
    });
    expect(parseSlashCommand('/borntask idea HLP Email customers when a shipment is delayed')).toEqual({
      type: 'idea',
      projectKey: 'HLP',
      title: 'Email customers when a shipment is delayed',
    });
    expect(parseSlashCommand('/borntask')).toBe('usage');
  });
});

describe('slash payload creates a task', () => {
  test('MESSAGE slash calls create with bug, WEB and the title', async () => {
    const created: unknown[] = [];
    const deps: ChatAppDeps = {
      authForEmail: async () => ({ userId: 'u1', tenantId: 't1' }) as Authed,
      createTask: async (_auth, input) => {
        created.push(input);
        return {
          taskKey: 'WEB-163',
          title: input.title,
          projectName: 'Website relaunch',
          typeName: 'Bug',
          statusName: 'Idea',
          url: 'http://localhost:5174/p/WEB/list?task=WEB-163',
        };
      },
      projectKeyForMessage: async () => 'WEB',
      moveTask: async () => {
        throw new Error('moveTask should not run for slash create');
      },
    };
    const reply = await handleChatAppEvent(
      slashEvent('/borntask bug WEB Checkout button hidden on iPhone SE'),
      deps,
    );
    expect(created).toEqual([
      { projectKey: 'WEB', type: 'bug', title: 'Checkout button hidden on iPhone SE', description: '' },
    ]);
    expect(JSON.stringify(reply)).toContain('WEB-163');
    expect(JSON.stringify(reply)).toContain('Open');
  });
});

describe('idea card Approve calls moveTask', () => {
  test('CARD_CLICKED approve uses approved as the mapped user', async () => {
    const moves: { key: string; to: string }[] = [];
    const auth = { userId: 'u_daniela', tenantId: 't1' } as Authed;
    const deps: ChatAppDeps = {
      authForEmail: async () => auth,
      createTask: async () => {
        throw new Error('create should not run');
      },
      projectKeyForMessage: async () => 'WEB',
      moveTask: async (who, key, input) => {
        expect(who.userId).toBe('u_daniela');
        moves.push({ key, to: input.toStatusId });
        return {} as never;
      },
    };
    const reply = await handleChatAppEvent(
      {
        type: 'CARD_CLICKED',
        user: actor.user,
        common: { invokedFunction: 'approve' },
        action: { parameters: [{ key: 'taskKey', value: 'HLP-16' }] },
      },
      deps,
    );
    expect(moves).toEqual([{ key: 'HLP-16', to: 'approved' }]);
    expect(reply).toEqual({ text: 'Approved HLP-16.' });
  });

  test('Reject without a comment asks in Chat', () => {
    expect(
      interpretChatEvent({
        type: 'CARD_CLICKED',
        common: { invokedFunction: 'reject' },
        action: { parameters: [{ key: 'taskKey', value: 'HLP-16' }] },
      }),
    ).toEqual({ kind: 'reject_need_comment', taskKey: 'HLP-16' });
  });

  test('applyIdeaCardAction forwards to moveTask', async () => {
    const seen: string[] = [];
    await applyIdeaCardAction(
      { userId: 'u1' } as Authed,
      { taskKey: 'WEB-1', toStatusId: 'rejected', comment: 'Out of scope' },
      async (_auth, key, input) => {
        seen.push(`${key}:${input.toStatusId}:${input.comment}`);
        return {} as never;
      },
    );
    expect(seen).toEqual(['WEB-1:rejected:Out of scope']);
  });
});
