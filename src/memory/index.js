import { LocalMemoryStore } from './local.js';
import { Mem0Store } from './mem0.js';

export function createMemoryStore({ provider = 'local', baseUrl, userId } = {}) {
  if (provider === 'local') return new LocalMemoryStore();
  if (provider === 'mem0') return new Mem0Store({ baseUrl, userId });
  throw new Error(`지원하지 않는 memory provider: ${provider}`);
}
