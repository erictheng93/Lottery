import { handleHealth, type AppEnv } from '@lottery/core';

interface Context {
  env: AppEnv;
}

export function onRequestGet({ env }: Context): Promise<Response> {
  return handleHealth(env);
}
