import { TranslationCacheEntry, TranslationSettings } from '../shared/types';
import { createTranslationProvider, TranslationProvider, TranslationResponse } from './provider';

export const MAX_CHUNK_LENGTH = 800;

/**
 * Splits text into bounded chunks respecting sentence boundaries where possible.
 */
export function splitTextIntoChunks(text: string, maxChunkLength = MAX_CHUNK_LENGTH): string[] {
  if (!text || text.trim().length === 0) return [];
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkLength) {
      chunks.push(remaining);
      break;
    }

    // Try sentence end (. ! ? \n)
    let splitIndex = -1;
    const sub = remaining.slice(0, maxChunkLength);
    const matches = Array.from(sub.matchAll(/([.!?\n]+)\s+/g));
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined) {
        splitIndex = lastMatch.index + lastMatch[0].length;
      }
    }

    // Fallback to space
    if (splitIndex <= 0) {
      const lastSpace = sub.lastIndexOf(' ');
      if (lastSpace > 0) {
        splitIndex = lastSpace + 1;
      }
    }

    // Hard fallback if no spaces
    if (splitIndex <= 0) {
      splitIndex = maxChunkLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }

  return chunks;
}

/**
 * In-memory LRU Translation Cache with TTL and Bounded Size.
 */
export class TranslationCache {
  private cache = new Map<string, TranslationCacheEntry>();
  private maxEntries: number;
  private ttlMs: number;

  constructor(maxEntries = 500, ttlMs = 86400000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  static generateKey(text: string, sourceLang: string, targetLang: string, provider: string): string {
    const trimmed = text.trim();
    return `${provider}:${sourceLang}:${targetLang}:${trimmed}`;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU position
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.translatedText;
  }

  set(key: string, sourceText: string, translatedText: string, sourceLang: string, targetLang: string, provider: string): void {
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      key,
      sourceText,
      translatedText,
      sourceLang,
      targetLang,
      provider,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Translation Manager with Request Deduplication, Concurrency Management,
 * Cancellation, Chunking, and Bounded Caching.
 */
export class TranslationManager {
  private cache: TranslationCache;
  private settings: TranslationSettings;
  private activeRequests = new Map<string, Promise<TranslationResponse>>();

  constructor(settings: TranslationSettings) {
    this.settings = settings;
    this.cache = new TranslationCache(settings.maxCacheEntries, settings.cacheTTLMs);
  }

  updateSettings(settings: TranslationSettings): void {
    this.settings = settings;
    this.cache = new TranslationCache(settings.maxCacheEntries, settings.cacheTTLMs);
  }

  async translateText(text: string, sourceLang?: string, targetLang?: string, signal?: AbortSignal): Promise<TranslationResponse> {
    const src = sourceLang || this.settings.sourceLang;
    const tgt = targetLang || this.settings.targetLang;
    const providerObj = createTranslationProvider(this.settings.provider);

    // If text exceeds MAX_CHUNK_LENGTH, chunk and translate
    if (text.length > MAX_CHUNK_LENGTH) {
      const chunks = splitTextIntoChunks(text, MAX_CHUNK_LENGTH);
      const translatedChunks: string[] = [];
      let detectedLang = src;

      for (const chunk of chunks) {
        if (signal?.aborted) throw new Error('Translation aborted');
        const res = await this.translateSingleChunk(chunk, src, tgt, signal, providerObj);
        translatedChunks.push(res.translatedText);
        if (res.detectedSourceLang) detectedLang = res.detectedSourceLang;
      }

      return {
        translatedText: translatedChunks.join(''),
        detectedSourceLang: detectedLang,
        provider: providerObj.name
      };
    }

    return await this.translateSingleChunk(text, src, tgt, signal, providerObj);
  }

  private async translateSingleChunk(
    text: string,
    src: string,
    tgt: string,
    signal?: AbortSignal,
    providerObj = createTranslationProvider(this.settings.provider)
  ): Promise<TranslationResponse> {
    const cacheKey = TranslationCache.generateKey(text, src, tgt, providerObj.name);

    // 1. Cache hit check
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult !== null) {
      return {
        translatedText: cachedResult,
        detectedSourceLang: src,
        provider: providerObj.name
      };
    }

    // 2. In-flight request deduplication
    if (this.activeRequests.has(cacheKey)) {
      return await this.activeRequests.get(cacheKey)!;
    }

    // 3. Initiate request with concurrency handling
    const promise = (async () => {
      try {
        const response = await providerObj.translate({
          text,
          sourceLang: src,
          targetLang: tgt,
          signal
        });

        // Store successful translation in cache
        this.cache.set(cacheKey, text, response.translatedText, src, tgt, providerObj.name);
        return response;
      } finally {
        this.activeRequests.delete(cacheKey);
      }
    })();

    this.activeRequests.set(cacheKey, promise);
    return await promise;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size();
  }
}
