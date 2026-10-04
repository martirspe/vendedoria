export type PasswordStrength = {
  /** 0 empty, 1 weak, 2 fair, 3 good, 4 strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

const LABELS = ['', 'Débil', 'Aceptable', 'Buena', 'Fuerte'] as const;

/** Guidance only: the API enforces just the 8-character minimum. */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: LABELS[0] };
  if (password.length < 8) return { score: 1, label: LABELS[1] };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  let score = 1 + (variety >= 2 ? 1 : 0) + (variety >= 3 ? 1 : 0) + (password.length >= 12 && variety >= 3 ? 1 : 0);
  if (/^(.)\1+$/.test(password)) score = 1;
  const clamped = Math.min(score, 4) as PasswordStrength['score'];
  return { score: clamped, label: LABELS[clamped] };
}

/** Up to two initials for the avatar, from the name or else the email. */
export function initialsOf(fullName: string | null | undefined, email: string): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}
