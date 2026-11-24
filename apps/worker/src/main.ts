import { Queue, Worker } from 'bullmq';
import { deliverWebhook } from './deliver.js';

const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const connection = { url };

export const webhookQueue = new Queue('webhooks', { connection });

export function startWebhookWorker() {
  return new Worker(
    'webhooks',
    async (job) => deliverWebhook(job.data),
    { connection },
  );
}

if (process.env.RUN_WORKER === '1') {
  startWebhookWorker();
  console.log('Worker de webhooks escutando a fila webhooks.');
}
