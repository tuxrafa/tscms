import { deliveryContentSchema, type DeliveryContent } from '@tscms/api-contracts';

export interface DeliveryClientOptions {
  baseUrl: string;
  siteKey: string;
  fetchImpl?: typeof fetch;
  token?: string;
}

export class DeliveryClient {
  constructor(private readonly options: DeliveryClientOptions) {}

  async getContent(id: string): Promise<DeliveryContent> {
    return deliveryContentSchema.parse(await this.request(`/content/${id}`));
  }

  async listCollection(name: string, query: Record<string, string> = {}): Promise<{ data: DeliveryContent[] }> {
    const params = new URLSearchParams(query);
    const payload = (await this.request(`/collections/${name}?${params.toString()}`)) as { data: unknown[] };
    return { data: payload.data.map((item) => deliveryContentSchema.parse(item)) };
  }

  async getPage(path: string): Promise<unknown> {
    return this.request(`/pages/by-path?path=${encodeURIComponent(path)}`);
  }

  async getFragment(id: string): Promise<unknown> {
    return this.request(`/fragments/${id}`);
  }

  private async request(path: string): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.options.token) headers.authorization = `Bearer ${this.options.token}`;
    const response = await fetchImpl(`${this.options.baseUrl.replace(/\/$/, '')}/v1/delivery/sites/${this.options.siteKey}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`Delivery API respondeu ${response.status}.`);
    }
    return response.json();
  }
}
