import { signWebhook } from '@tscms/publishing';

export interface DeliveryAttempt {
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface DeliveryResult {
  status: 'delivered' | 'retry';
  attempts: number;
  error?: string;
}

export async function deliverWebhook(attempt: DeliveryAttempt, fetchImpl: typeof fetch = fetch): Promise<DeliveryResult> {
  const body = JSON.stringify(attempt.payload);
  const attempts = attempt.attempts + 1;
  try {
    const response = await fetchImpl(attempt.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tscms-event': attempt.event,
        'x-tscms-signature': signWebhook(attempt.secret, body),
      },
      body,
    });
    if (!response.ok) return { status: 'retry', attempts, error: `HTTP ${response.status}` };
    return { status: 'delivered', attempts };
  } catch (error) {
    return { status: 'retry', attempts, error: error instanceof Error ? error.message : 'falha de rede' };
  }
}
