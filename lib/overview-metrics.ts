export type MetricConversation = {
  createdAt: Date;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
};

export function calculateOverviewMetrics(
  conversations: MetricConversation[],
  now = new Date(),
  slaMinutes = 5,
) {
  const slaMs = slaMinutes * 60_000;
  const responded = conversations.filter((item) => item.firstResponseAt);
  const responseSeconds = responded.map((item) =>
    Math.max(
      0,
      ((item.firstResponseAt as Date).getTime() - item.createdAt.getTime()) / 1000,
    ),
  );
  const slaEligible = conversations.filter(
    (item) =>
      item.firstResponseAt ||
      now.getTime() - item.createdAt.getTime() > slaMs,
  );
  const slaMet = slaEligible.filter(
    (item) =>
      item.firstResponseAt &&
      item.firstResponseAt.getTime() - item.createdAt.getTime() <= slaMs,
  ).length;
  const resolved = conversations.filter((item) => item.resolvedAt);
  const resolutionMinutes = resolved.map((item) =>
    Math.max(
      0,
      ((item.resolvedAt as Date).getTime() - item.createdAt.getTime()) / 60_000,
    ),
  );

  return {
    total: conversations.length,
    resolved: resolved.length,
    averageResponseSeconds: responseSeconds.length
      ? responseSeconds.reduce((total, value) => total + value, 0) /
        responseSeconds.length
      : null,
    averageResolutionMinutes: resolutionMinutes.length
      ? resolutionMinutes.reduce((total, value) => total + value, 0) /
        resolutionMinutes.length
      : null,
    slaRate: slaEligible.length ? (slaMet / slaEligible.length) * 100 : 100,
    slaBreaches: slaEligible.length - slaMet,
  };
}

export function buildDailyVolume(
  conversations: Array<{ createdAt: Date }>,
  days: number,
  now = new Date(),
) {
  const result: Array<{ key: string; label: string; count: number }> = [];
  const counts = new Map<string, number>();

  for (const conversation of conversations) {
    const key = conversation.createdAt.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    result.push({
      key,
      label: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC",
      }).format(date),
      count: counts.get(key) ?? 0,
    });
  }

  return result;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "Sem dados";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${Math.round(seconds % 60)}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
