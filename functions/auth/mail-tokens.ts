export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function storeMailToken(
  db: D1Database,
  token: string,
  ttlSeconds: number,
  now = Date.now(),
): Promise<void> {
  const tokenHash = await sha256Hex(token);
  // The verification JWT is identical for the same email inside one second.
  // A second insert of that hash must not turn the response into 500.
  await db
    .prepare('INSERT OR IGNORE INTO mail_token (token_hash, kind, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, 'verification', now + ttlSeconds * 1000)
    .run();
}

export async function consumeMailToken(
  db: D1Database,
  token: string,
  now = Date.now(),
): Promise<boolean> {
  const tokenHash = await sha256Hex(token);
  const result = await db
    .prepare('DELETE FROM mail_token WHERE token_hash = ? AND expires_at >= ? RETURNING token_hash')
    .bind(tokenHash, now)
    .all<{ token_hash: string }>();
  return result.results.length > 0;
}
