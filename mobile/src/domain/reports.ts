export const reportReasons = ['harassment', 'spam', 'sexual_content', 'violence', 'other'] as const;
export type ReportReason = (typeof reportReasons)[number];
export function reportReason(value: string): ReportReason {
  if (!reportReasons.includes(value as ReportReason)) throw new Error('Choose a report category.');
  return value as ReportReason;
}
