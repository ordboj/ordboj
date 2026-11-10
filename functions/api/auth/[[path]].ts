import { handleAuthRequest } from '../../auth/handler';
import type { Env } from '../../env';

export const onRequest: PagesFunction<Env> = (context) => {
  return handleAuthRequest(context.request, context.env, {
    waitUntil: (promise) => context.waitUntil(promise),
  });
};
