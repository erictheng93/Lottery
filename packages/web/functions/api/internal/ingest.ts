import { handleIngest, type AppEnv } from '@lottery/core';

interface Context {
  request: Request;
  env: AppEnv;
}

export function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleIngest(request, env);
}
