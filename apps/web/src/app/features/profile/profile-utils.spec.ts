import { initialsOf, passwordStrength } from './profile-utils';

describe('passwordStrength', () => {
  it('is empty without a password and weak under the API minimum', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('Ab1!').score).toBe(1);
  });

  it('rewards variety and length', () => {
    expect(passwordStrength('solominusculas').score).toBe(1);
    expect(passwordStrength('clave2026').score).toBe(2);
    expect(passwordStrength('Clave2026').score).toBe(3);
    expect(passwordStrength('MiClave-2026!').score).toBe(4);
  });

  it('treats a repeated character as weak', () => {
    expect(passwordStrength('aaaaaaaaaaaa').score).toBe(1);
  });
});

describe('initialsOf', () => {
  it('uses first and last name, a single name, or the email', () => {
    expect(initialsOf('María José Pérez', 'm@x.com')).toBe('MP');
    expect(initialsOf('  maría ', 'm@x.com')).toBe('MA');
    expect(initialsOf(null, 'ops@marca.com')).toBe('OP');
  });
});
