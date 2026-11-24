import { describe, expect, it } from 'vitest';
import { toMobileArticle } from './view-model.js';

describe('consumidor móvel', () => {
  it('usa só os campos publicados', () => {
    expect(toMobileArticle({ data: { title: 'Episódio', duration: 3600 } })).toEqual({
      headline: 'Episódio',
      minutes: 60,
    });
  });
});
