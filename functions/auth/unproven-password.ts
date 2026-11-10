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

// A sign-up password was chosen before the mailbox was proven. The person who
// set it still knows it, so using it does not prove the owner. It becomes
// proven only after a successful password sign-in once the email is already
// verified, or after a password reset (the reset link was mailed).
export async function markPasswordProven(db: D1Database, email: string): Promise<void> {
  const user = await findUser(db, email);
  if (!user || !isVerified(user)) return;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO password_proof (user_id, proven_at) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET proven_at = excluded.proven_at`,
    )
    .bind(user.id, now)
    .run();
}

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
