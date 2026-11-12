import { useLocation, useSearchParams } from 'react-router-dom';
import { AuthScreen, TextLink } from '@/components/AuthScreen';
import { AUTH_COPY } from '@/lib/auth/copy';

export default function VerifyEmail() {
  const [search] = useSearchParams();
  const location = useLocation();
  const failed = search.get('error');
  const verified = search.get('verified') === '1' && !failed;
  const email =
    location.state && typeof location.state === 'object' && 'email' in location.state
      ? String((location.state as { email?: unknown }).email ?? '')
      : '';

  const title = failed
    ? AUTH_COPY.verifyTitle
    : verified
      ? AUTH_COPY.verifiedTitle
      : AUTH_COPY.verifyTitle;
  const body = failed
    ? AUTH_COPY.verifyError
    : verified
      ? AUTH_COPY.verifiedBody
      : AUTH_COPY.verifyBody;

  return (
    <AuthScreen title={title} intro={body}>
      {!failed && !verified && email ? (
        <p>
          {AUTH_COPY.verifySentPrefix} {email}.
        </p>
      ) : null}
      <TextLink to="/sign-in">{AUTH_COPY.passwordSignIn}</TextLink>
    </AuthScreen>
  );
}
