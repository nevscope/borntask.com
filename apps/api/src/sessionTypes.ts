declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: string;
    tenantId?: string;
    oauthState?: string;
    inviteToken?: string;
  }
}

export {};
