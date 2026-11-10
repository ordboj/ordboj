// A verified sign-in proves the mailbox. Drop every account and session that
// existed while the email was unverified (password or an unverified provider),
// then mark the email verified so the verified identity can link to this row.
export async function dropUnprovenPassword(db: D1Database, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const user = await db
    .prepare('SELECT id, emailVerified FROM user WHERE email = ?')
    .bind(normalized)
    .first<{ id: string; emailVerified: number | boolean }>();
  if (!user || Number(user.emailVerified) === 1 || user.emailVerified === true) return;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('DELETE FROM session WHERE userId = ?').bind(user.id),
    db.prepare('DELETE FROM account WHERE userId = ?').bind(user.id),
    db
      .prepare(
        'UPDATE user SET emailVerified = 1, name = ?, image = NULL, updatedAt = ? WHERE id = ? AND emailVerified = 0',
      )
      .bind('', now, user.id),
  ]);
}
