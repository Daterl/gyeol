import { expect, test, vi } from 'vitest';
import type { ProfileConnectionResponse } from '@/types/contracts';
import { pollProfileConnection } from './profile-connection';

test('profile polling waits five seconds and stops after a 150 second window', async () => {
  const pending: ProfileConnectionResponse = {
    status: 'pending',
    refresh_required: false,
  };
  const client = vi.fn().mockResolvedValue(pending);
  const waits: number[] = [];
  const result = await pollProfileConnection(
    client,
    {
      schema_version: '1.0',
      action: 'connect',
      profile_url: 'https://www.instagram.com/public_example/',
      confirmLive: true,
    },
    new AbortController().signal,
    async (milliseconds) => {
      waits.push(milliseconds);
    },
  );
  expect(result).toBe(pending);
  expect(client).toHaveBeenCalledTimes(31);
  expect(client.mock.calls[0]?.[0]).toMatchObject({ action: 'connect' });
  expect(
    client.mock.calls
      .slice(1)
      .every(([request]) => request.action === 'status'),
  ).toBe(true);
  expect(waits).toEqual(Array(30).fill(5_000));
});

test('profile polling returns immediately when collection completes', async () => {
  const result: ProfileConnectionResponse = {
    status: 'public',
    snapshotId: 'snapshot',
    expires_at: Date.now() + 60_000,
    refresh_required: false,
  };
  const client = vi.fn().mockResolvedValue(result);
  const wait = vi.fn();
  await expect(
    pollProfileConnection(
      client,
      {
        schema_version: '1.0',
        action: 'status',
        profile_url: 'https://www.instagram.com/public_example/',
      },
      new AbortController().signal,
      wait,
    ),
  ).resolves.toBe(result);
  expect(wait).not.toHaveBeenCalled();
});
