export function parseStopovers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseStopovers(item));
  }

  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (trimmed === "") return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return parseStopovers(JSON.parse(trimmed));
    } catch {
      // Fall through to comma-separated parsing below.
    }
  }

  return trimmed
    .split(/[,，;；\r\n]+/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function formatStopovers(value: unknown): string {
  return parseStopovers(value).join(", ");
}

export function formatRouteWithStopovers(
  departure: string,
  stopovers: unknown,
  destination: string,
): string {
  return [departure.trim(), ...parseStopovers(stopovers), destination.trim()]
    .filter((item) => item !== "")
    .join(" → ");
}
