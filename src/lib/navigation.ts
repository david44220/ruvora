export function safeReturnTo(value?: string | null): string {
  if (!value || value.length > 500) return "/app";
  if (
    /^\/app\/opportunities(?:\?campaign=[a-zA-Z0-9_-]+)?$/.test(value) ||
    /^\/events\/[a-z0-9-]+$/.test(value)
  )
    return value;
  return "/app";
}
