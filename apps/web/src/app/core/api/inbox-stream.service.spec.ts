import { parseInboxEvent } from './inbox-stream.service';

describe('parseInboxEvent', () => {
  it('reads inbox events emitted by the API', () => {
    expect(
      parseInboxEvent('event: inbox\nid: 3\ndata: {"conversationId":"c1","kind":"message"}'),
    ).toEqual({ kind: 'message', conversationId: 'c1' });
    expect(
      parseInboxEvent('event: inbox\ndata: {"conversationId":"c2","kind":"conversation"}'),
    ).toEqual({ kind: 'conversation', conversationId: 'c2' });
  });

  it('ignores heartbeats, other events and malformed data', () => {
    expect(parseInboxEvent('event: ping\ndata: {}')).toBeNull();
    expect(parseInboxEvent('event: ready\ndata: {}')).toBeNull();
    expect(parseInboxEvent('event: inbox\ndata: not-json')).toBeNull();
    expect(parseInboxEvent('event: inbox\ndata: {"kind":"message"}')).toBeNull();
  });
});
