import { ADDRESS_DAILY_CAP, IP_DAILY_CAP, RESEND_DAILY_CAP, RESEND_MONTHLY_CAP } from './constants';

export type MailScope = 'day' | 'month' | 'address' | 'ip';

export function mailCounterKey(
  scope: MailScope,
  input: { now: Date; email?: string; ip?: string },
): { scope: MailScope; subject: string } {
  const day = input.now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  if (scope === 'day') return { scope, subject: day };
  if (scope === 'month') return { scope, subject: month };
  if (scope === 'address') return { scope, subject: `${day}:${(input.email ?? '').toLowerCase()}` };
  return { scope, subject: `${day}:${input.ip ?? 'unknown'}` };
}

function capFor(scope: MailScope): number {
  if (scope === 'day') return RESEND_DAILY_CAP;
  if (scope === 'month') return RESEND_MONTHLY_CAP;
  if (scope === 'address') return ADDRESS_DAILY_CAP;
  return IP_DAILY_CAP;
}

function keysFor(input: { now: Date; email: string; ip: string }) {
  const scopes: MailScope[] = ['day', 'month', 'ip'];
  if (input.email) scopes.push('address');
  return scopes.map((scope) => ({ ...mailCounterKey(scope, input), cap: capFor(scope) }));
}

export async function mailSendAllowed(
  db: D1Database,
  input: { now: Date; email: string; ip: string },
): Promise<boolean> {
  for (const key of keysFor(input)) {
    const row = await db
      .prepare('SELECT count FROM mail_counter WHERE scope = ? AND subject = ?')
      .bind(key.scope, key.subject)
      .first<{ count: number }>();
    if (Number(row?.count ?? 0) >= key.cap) return false;
  }
  return true;
}

export async function recordMailSend(
  db: D1Database,
  input: { now: Date; email: string; ip: string },
): Promise<void> {
  const statements = keysFor(input).map((key) =>
    db
      .prepare(
        `INSERT INTO mail_counter (scope, subject, count) VALUES (?, ?, 1)
         ON CONFLICT(scope, subject) DO UPDATE SET count = count + 1`,
      )
      .bind(key.scope, key.subject),
  );
  await db.batch(statements);
}
