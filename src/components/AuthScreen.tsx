import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SupportLosevNotice } from '@/components/SupportLosevNotice';
import { AUTH_COPY } from '@/lib/auth/copy';

export function AuthScreen({
  title,
  intro,
  children,
  showLosev = false,
}: {
  title: string;
  intro?: string;
  children?: ReactNode;
  showLosev?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/favicon.svg"
            alt=""
            width={64}
            height={64}
            aria-hidden="true"
            className="size-16 rounded-2xl"
          />
          <p className="text-4xl font-bold text-primary">{AUTH_COPY.productName}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            {intro ? <CardDescription>{intro}</CardDescription> : null}
          </CardHeader>
          {children ? <CardContent className="space-y-4">{children}</CardContent> : null}
        </Card>
        {showLosev ? <SupportLosevNotice className="text-center" /> : null}
      </div>
    </div>
  );
}

export function AuthStatus({ children }: { children: ReactNode }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-sm text-primary underline underline-offset-4">
      {children}
    </Link>
  );
}

export function OfflineSignIn() {
  return <AuthScreen title={AUTH_COPY.offlineTitle} intro={AUTH_COPY.offlineBody} showLosev />;
}
