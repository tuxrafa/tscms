import { DeliveryClient } from '@tscms/delivery-sdk';

export interface ArticleView {
  title: string;
  summary: string;
}

export async function loadArticle(client: DeliveryClient, id: string): Promise<ArticleView> {
  const content = await client.getContent(id);
  const data = content.data as { title?: string; body?: { content?: Array<{ children?: Array<{ text?: string }> }> } };
  const summary = data.body?.content?.[0]?.children?.map((child) => child.text ?? '').join('') ?? '';
  return { title: data.title ?? content.slug, summary };
}
