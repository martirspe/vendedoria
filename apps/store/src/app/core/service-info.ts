import type { PublicServiceInfo, ServiceMode } from '@vendedoria/contracts';

const MODE_LABELS: Record<ServiceMode, string> = {
  onsite: 'En el local',
  home: 'A domicilio',
  online: 'En línea',
};

/** "60 min aprox. · A domicilio"; empty when the merchant set neither. */
export function serviceSummary(info: PublicServiceInfo | null | undefined): string {
  if (!info) return '';
  return [
    info.durationMinutes ? durationLabel(info.durationMinutes) : null,
    info.mode ? MODE_LABELS[info.mode] : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min aprox.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h${rest ? ` ${rest} min` : ''} aprox.`;
}
