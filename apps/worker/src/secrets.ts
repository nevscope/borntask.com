import { createDecipheriv, createHash } from 'node:crypto';

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivB, tagB, dataB] = payload.split('.');
  if (!ivB || !tagB || !dataB) throw new Error('Stored secret is not readable.');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
}
