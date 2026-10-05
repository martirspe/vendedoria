import { parseLiveUpdate } from './live.page';

describe('LIVE SSE panel invalidation', () => {
  it('refreshes on durable LIVE notifications using the inbox transport', () => {
    expect(parseLiveUpdate('event: live\ndata: {"sessionId":"fixture"}')).toEqual({
      kind: 'reconnected',
    });
  });
  it('ignores heartbeats and unrelated notifications', () => {
    expect(parseLiveUpdate('event: ping\ndata: {}')).toBeNull();
    expect(parseLiveUpdate('event: inbox\ndata: {}')).toBeNull();
    expect(parseLiveUpdate('event: live')).toBeNull();
  });
});
