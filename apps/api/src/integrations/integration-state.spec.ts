import { resolveActive } from './integration-state';

const allowAll = () => true;

describe('integration state', () => {
  it('keeps independent integrations independent of the store', () => {
    expect(resolveActive('instagram', new Set(['instagram']), allowAll)).toBe(true);
    expect(resolveActive('team', new Set(['team']), allowAll)).toBe(true);
  });

  it('pauses the integrations that run on the store while it is off', () => {
    expect(resolveActive('custom_domain', new Set(['custom_domain']), allowAll)).toBe(false);
    expect(resolveActive('tracking', new Set(['tracking']), allowAll)).toBe(false);
    expect(resolveActive('tracking', new Set(['tracking', 'store']), allowAll)).toBe(true);
  });

  it('requires the plan to include the integration', () => {
    expect(resolveActive('tracking', new Set(['tracking', 'store']), (key) => key !== 'tracking')).toBe(false);
  });
});
