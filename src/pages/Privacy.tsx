import { AuthScreen, TextLink } from '@/components/AuthScreen';
import { AUTH_COPY } from '@/lib/auth/copy';

export default function Privacy() {
  return (
    <AuthScreen title={AUTH_COPY.privacyTitle} intro={AUTH_COPY.privacyBody}>
      <TextLink to="/sign-in">{AUTH_COPY.privacyBack}</TextLink>
    </AuthScreen>
  );
}
