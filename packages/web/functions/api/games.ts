import { handleGames } from '@lottery/core/api';

export function onRequestGet(): Response {
  return handleGames();
}
