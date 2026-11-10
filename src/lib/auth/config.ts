export interface AuthConfig {
  oauth: {
    google: boolean;
    github: boolean;
    microsoft: boolean;
  };
  mail: boolean;
}

export const EMPTY_AUTH_CONFIG: AuthConfig = {
  oauth: { google: false, github: false, microsoft: false },
  mail: false,
};

function flag(value: unknown): boolean {
  return value === true;
}

export function parseAuthConfig(data: unknown): AuthConfig {
  if (!data || typeof data !== 'object') return EMPTY_AUTH_CONFIG;
  const record = data as { oauth?: unknown; mail?: unknown };
  const oauth =
    record.oauth && typeof record.oauth === 'object'
      ? (record.oauth as { google?: unknown; github?: unknown; microsoft?: unknown })
      : {};
  return {
    oauth: {
      google: flag(oauth.google),
      github: flag(oauth.github),
      microsoft: flag(oauth.microsoft),
    },
    mail: flag(record.mail),
  };
}

export async function loadAuthConfig(): Promise<AuthConfig> {
  try {
    const response = await fetch('/api/auth-config', {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return EMPTY_AUTH_CONFIG;
    return parseAuthConfig((await response.json()) as unknown);
  } catch {
    return EMPTY_AUTH_CONFIG;
  }
}
