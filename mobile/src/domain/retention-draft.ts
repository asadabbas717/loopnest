export type DurationUnit = 'hours' | 'days';
export function retentionDraft(seconds: number | null) {
  return {
    enabled: seconds !== null,
    value: String(seconds === null ? 24 : seconds % 86400 === 0 ? seconds / 86400 : seconds / 3600),
    unit: (seconds !== null && seconds % 86400 === 0 ? 'days' : 'hours') as DurationUnit,
  };
}
export function convertDuration(value: string, from: DurationUnit, to: DurationUnit): string {
  if (from === to || !/^\d+(?:\.\d+)?$/.test(value)) return value;
  const converted = Number(value) * (from === 'hours' ? 1 / 24 : 24);
  // Converted fractional days must return to a clean whole-hour value.
  if (to === 'hours' && Math.abs(converted - Math.round(converted)) < 0.00002)
    return String(Math.round(converted));
  return String(Number(converted.toFixed(6)));
}
export function durationSeconds(value: string, unit: DurationUnit): number {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return Number.NaN;
  const raw = Number(value) * (unit === 'hours' ? 3600 : 86400);
  const hours = Math.round(raw / 3600);
  // Six decimal places can represent converted days within 0.044 seconds.
  return hours >= 1 && hours <= 720 && Math.abs(raw - hours * 3600) < 0.1
    ? hours * 3600
    : Number.NaN;
}
