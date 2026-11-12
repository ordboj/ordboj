import { handleAuthConfigRequest } from '../auth/public-config';
import type { Env } from '../env';

export const onRequest: PagesFunction<Env> = (context) => {
  return handleAuthConfigRequest(context.request, context.env);
};
