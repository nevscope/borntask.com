import { describe, expect, test } from 'vitest';
import { accessHandledKind, accessRequestKind, parseAccessNotifyKind } from '../apps/api/src/lib/accessNotify.ts';

describe('access request notification kinds', () => {
  test('encodes a pending request and a handled outcome', () => {
    expect(parseAccessNotifyKind(accessRequestKind('GEN', 'req1'))).toEqual({
      state: 'pending',
      projectKey: 'GEN',
      requestId: 'req1',
    });
    expect(parseAccessNotifyKind(accessHandledKind('GEN', 'req1', 'approved', 'u9'))).toEqual({
      state: 'handled',
      projectKey: 'GEN',
      requestId: 'req1',
      outcome: 'approved',
      handlerId: 'u9',
    });
  });

  test('reads the older access_request:KEY shape', () => {
    expect(parseAccessNotifyKind('access_request:ROW')).toEqual({
      state: 'pending',
      projectKey: 'ROW',
      requestId: null,
    });
  });
});
