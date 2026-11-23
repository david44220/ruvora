/**
 * Pure zero-dependency RFC 5545 iCalendar (.ics) generator for Creator Post Plans.
 * Keeps line endings strictly CRLF and escapes reserved ICS control characters.
 */

export interface PostPlanIcsInput {
  id: string;
  title: string;
  scheduledFor: Date;
  socialChannel: string;
  campaignName?: string | null;
  note?: string | null;
  appUrl?: string;
}

function formatUtcIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildPostPlanIcs(input: PostPlanIcsInput, now = new Date()): string {
  const start = input.scheduledFor;
  const end = new Date(start.getTime() + 30 * 60_000);
  const safeId = input.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "plan";
  const summaryParts = [input.title.trim()];
  if (input.socialChannel) summaryParts.push(`[${input.socialChannel}]`);

  const descriptionLines: string[] = [];
  if (input.campaignName) descriptionLines.push(`Campaign: ${input.campaignName}`);
  descriptionLines.push(`Channel: ${input.socialChannel}`);
  if (input.note && input.note.trim()) descriptionLines.push(`Notes: ${input.note.trim()}`);
  descriptionLines.push("Reminder: Include commercial partner disclosure (#ad / #collaboration).");
  if (input.appUrl) descriptionLines.push(`Ruvora Studio: ${input.appUrl}/app/promote`);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ruvora//Creator Post Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:ruvora-plan-${safeId}@ruvora.app`,
    `DTSTAMP:${formatUtcIcsDate(now)}`,
    `DTSTART:${formatUtcIcsDate(start)}`,
    `DTEND:${formatUtcIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(summaryParts.join(" "))}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join("\n"))}`,
    ...(input.appUrl ? [`URL:${input.appUrl}/app/promote`] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(input.title.trim())}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
