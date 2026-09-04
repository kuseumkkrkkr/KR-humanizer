const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export class Mem0Store {
  constructor({ baseUrl = 'http://127.0.0.1:8888', userId = 'default' } = {}) {
    this.baseUrl = new URL(baseUrl);
    if (!localHosts.has(this.baseUrl.hostname)) throw new Error('외부 API 방지를 위해 mem0는 localhost 주소만 허용합니다.');
    this.userId = userId;
  }

  async request(path, body) {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`mem0 returned HTTP ${response.status}`);
    return response.json();
  }

  async search(query, limit = 8) {
    const value = await this.request('/v2/memories/search/', { query, filters: { user_id: this.userId }, top_k: limit });
    return (value.results ?? []).map((item) => ({ text: item.memory, score: item.score, id: item.id }));
  }

  async add(text, metadata = {}) {
    return this.request('/v1/memories/', {
      messages: [{ role: 'user', content: text }],
      user_id: this.userId,
      metadata
    });
  }
}
