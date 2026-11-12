import { useSearchParams } from 'react-router-dom';
import { AuthScreen, TextLink } from '@/components/AuthScreen';
import { AUTH_COPY } from '@/lib/auth/copy';

export default function MagicLink() {
  const [search] = useSearchParams();
  const failed = Boolean(search.get('error'));

  return (
    <AuthScreen
      title={AUTH_COPY.magicTitle}
      intro={failed ? AUTH_COPY.magicError : AUTH_COPY.magicBody}
    >
      <TextLink to="/sign-in">{AUTH_COPY.passwordSignIn}</TextLink>
    </AuthScreen>
  );
}
