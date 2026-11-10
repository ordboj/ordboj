import { handleProgressRequest } from '../auth/progress';
import type { Env } from '../env';

export const onRequest: PagesFunction<Env> = (context) => {
  return handleProgressRequest(context.request, context.env);
};
