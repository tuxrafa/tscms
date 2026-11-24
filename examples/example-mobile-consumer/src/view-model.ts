export interface MobileArticle {
  headline: string;
  minutes: number | null;
}

export function toMobileArticle(payload: { data: Record<string, unknown> }): MobileArticle {
  const minutes = payload.data.duration;
  return {
    headline: String(payload.data.title ?? ''),
    minutes: typeof minutes === 'number' ? Math.round(minutes / 60) : null,
  };
}
