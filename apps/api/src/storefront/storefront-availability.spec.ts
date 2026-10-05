import { resolveStoreAvailability } from './storefront-availability';
import { planAllows, resolvePlanState } from '../billing/plan-catalog';

describe('store availability', () => {
  it('keeps publication stable as a plan expires and resumes after renewal', () => {
    const tenant = { planTier: 'GROW' as const, planTrial: false, planExpiresAt: new Date('2026-10-05T05:00:00Z') };
    const status = 'PUBLISHED' as const;
    const at = (time: string) => resolveStoreAvailability(status, planAllows(resolvePlanState(tenant, new Date(time)), 'store'));
    expect(at('2026-10-05T04:59:59Z').public).toBe(true);
    expect(at('2026-10-05T00:00:00-05:00')).toEqual({ public: false, previewAllowed: false, reason: 'integration_inactive' });
    tenant.planExpiresAt = new Date('2026-11-05T05:00:00Z');
    expect(at('2026-10-05T05:00:01Z').public).toBe(true);
    expect(status).toBe('PUBLISHED');
  });
  it('rejects suspended or disabled stores even for preview, and protects drafts', () => {
    expect(resolveStoreAvailability('SUSPENDED', true).previewAllowed).toBe(false);
    expect(resolveStoreAvailability('PUBLISHED', false).public).toBe(false);
    expect(resolveStoreAvailability('DRAFT', true)).toEqual({ public: false, previewAllowed: true, reason: 'draft' });
  });
});
