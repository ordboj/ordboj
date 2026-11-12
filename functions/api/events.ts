import { handleEventsRequest } from '../auth/events';
import type { Env } from '../env';

export const onRequest: PagesFunction<Env> = (context) => {
  return handleEventsRequest(context.request, context.env);
};
