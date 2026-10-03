import { assertOperatorPassword } from './platform-operators';
import {
  operatorCan,
  PLATFORM_PERMISSIONS,
  ROLE_PERMISSIONS,
} from './platform-permissions';

describe('operatorCan', () => {
  it('gives SUPERADMIN every permission', () => {
    expect(operatorCan('SUPERADMIN', PLATFORM_PERMISSIONS)).toBe(true);
  });

  it('lets ADMIN operate and support without money, operators, credentials or deletion', () => {
    expect(operatorCan('ADMIN', [])).toBe(true);
    expect(operatorCan('ADMIN', ['tenants.read', 'support.assist'])).toBe(true);
    for (const permission of [
      'billing.grant',
      'operators.manage',
      'integrations.manage',
      'tenants.delete',
    ] as const) {
      expect(operatorCan('ADMIN', [permission])).toBe(false);
    }
  });

  it('requires every listed permission', () => {
    expect(operatorCan('ADMIN', ['tenants.read', 'billing.grant'])).toBe(false);
  });

  it('only maps known permissions', () => {
    for (const granted of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of granted) {
        expect(PLATFORM_PERMISSIONS).toContain(permission);
      }
    }
  });
});

describe('assertOperatorPassword', () => {
  it('requires 12+ characters with letters and digits, within bcrypt limits', () => {
    expect(() => assertOperatorPassword('corta123')).toThrow();
    expect(() => assertOperatorPassword('sololetrasaqui')).toThrow();
    expect(() => assertOperatorPassword('123456789012')).toThrow();
    expect(() => assertOperatorPassword(`a1${'x'.repeat(71)}`)).toThrow();
    expect(() => assertOperatorPassword('operador2026seguro')).not.toThrow();
  });
});
