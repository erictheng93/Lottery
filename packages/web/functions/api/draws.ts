import { handleDraws, type AppEnv } from '@lottery/core';

interface Context {
  request: Request;
  env: AppEnv;
}

export function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleDraws(request, env);
}
