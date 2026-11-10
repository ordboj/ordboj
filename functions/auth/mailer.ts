import { MAIL_FROM } from './constants';

export type MailKind = 'verification' | 'reset' | 'magic-link';

export interface OutboundMail {
  to: string;
  from: string;
  subject: string;
  text: string;
  kind: MailKind;
}

export interface Mailer {
  send(mail: OutboundMail): Promise<void>;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createResendMailer(apiKey: string, fetchImpl: FetchLike = fetch): Mailer {
  return {
    async send(mail) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: mail.from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
        }),
      });
      if (!response.ok) {
        throw new Error('Resend rejected the message.');
      }
    },
  };
}

export function resolveMailer(
  env: { RESEND_API_KEY?: string },
  override?: Mailer | null,
): Mailer | null {
  if (override === null) return null;
  if (override) return override;
  if (!env.RESEND_API_KEY) return null;
  return createResendMailer(env.RESEND_API_KEY);
}

const SUBJECT: Record<MailKind, string> = {
  verification: 'Verify your Ordboj email',
  reset: 'Reset your Ordboj password',
  'magic-link': 'Sign in to Ordboj',
};

export async function sendAuthMail(
  mailer: Mailer,
  input: { kind: MailKind; to: string; url: string },
): Promise<void> {
  const text =
    input.kind === 'verification'
      ? `Verify your email for Ordboj.\n\n${input.url}\n`
      : input.kind === 'reset'
        ? `Reset your Ordboj password.\n\n${input.url}\n`
        : `Sign in to Ordboj.\n\n${input.url}\n`;
  await mailer.send({
    to: input.to,
    from: MAIL_FROM,
    subject: SUBJECT[input.kind],
    text,
    kind: input.kind,
  });
}
