export const AUTH_BASE_URL = 'https://ordboj.com';
export const PASSKEY_RP_ID = 'ordboj.com';
export const PASSKEY_ORIGIN = 'https://ordboj.com';
export const MAIL_FROM = 'no-reply@ordboj.com';

export const RESEND_DAILY_CAP = 100;
export const RESEND_MONTHLY_CAP = 3000;
// One address or one IP must not be able to use the whole daily Resend quota.
export const ADDRESS_DAILY_CAP = 12;
export const IP_DAILY_CAP = 30;

export const VERIFICATION_TTL_SECONDS = 900;
export const RESET_TTL_SECONDS = 900;
export const MAGIC_LINK_TTL_SECONDS = 300;

export const PROGRESS_BLOB_MAX_CHARS = 1_048_576;

export const GENERIC_MAIL_BODY = { status: true } as const;
export const MAIL_LIMIT_BODY = { status: true, message: 'Too many requests' } as const;
