type UserRow = { id: string; emailVerified: number | boolean };

function isVerified(user: UserRow): boolean {
  return user.emailVerified === true || Number(user.emailVerified) === 1;
}

async function findUser(db: D1Database, email: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT id, emailVerified FROM user WHERE email = ?')
    .bind(email.trim().toLowerCase())
    .first<UserRow>();
}

// A sign-up password stays unproven forever. Signing in with it after the
// verify click does not prove it: the person who chose it still knows it.
// A password is proven only when it is set after the mailbox is proven.
// Today that is the password-reset link. There is no signed-in set-password
// route yet. A verified OAuth or magic-link sign-in deletes an unproven
// password and the sessions opened with it. The owner sets a new password
// with reset.
export async function markPasswordProvenById(db: D1Database, userId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO password_proof (user_id, proven_at) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET proven_at = excluded.proven_at`,
    )
    .bind(userId, now)
    .run();
}

async function passwordIsProven(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT user_id FROM password_proof WHERE user_id = ?')
    .bind(userId)
    .first<{ user_id: string }>();
  return row !== null;
}

// A verified sign-in through another method drops a password that was never
// proven, and ends the sessions that password could have opened.
// An unverified row still loses every account and session, then becomes verified.
export async function dropUnprovenPassword(db: D1Database, email: string): Promise<void> {
  const user = await findUser(db, email);
  if (!user) return;
  const now = new Date().toISOString();
  if (isVerified(user)) {
    if (await passwordIsProven(db, user.id)) return;
    await db.batch([
      db.prepare('DELETE FROM session WHERE userId = ?').bind(user.id),
      db
        .prepare("DELETE FROM account WHERE userId = ? AND providerId = 'credential'")
        .bind(user.id),
    ]);
    return;
  }
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
