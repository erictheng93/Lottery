import { expect, test } from 'bun:test';
import type { GameConfig, InitListItem } from '@lottery/core';
import { buildIngestPayload } from './source';

test('buildIngestPayload converts source initlist items into normalized ingest draws', () => {
  const game: GameConfig = {
    id: 'wg539b',
    playkey: 'WN2WSJLHC',
    ptype: 'LHC',
    name: 'WG 539 B',
    numCount: 5,
  };
  const items: InitListItem[] = [
    {
      preDrawIssue: '20260619001',
      preDrawTime: '2026-06-19<br>12:00:00',
      preDrawCode: ['1', '12', '23', '34', '45'],
    },
  ];

  expect(buildIngestPayload(game, items)).toEqual({
    game_id: 'wg539b',
    draws: [
      {
        period_id: '20260619001',
        draw_time: '2026-06-19T12:00:00',
        numbers: [1, 12, 23, 34, 45],
        raw_data: items[0],
      },
    ],
  });
});
