import { TranslationCacheEntry, TranslationSettings } from '../shared/types';
import { createTranslationProvider, TranslationProvider, TranslationResponse } from './provider';

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
 * Splits text into bounded chunks (default ~800 characters) respecting sentence and word boundaries.
 */
export function chunkText(text: string, maxChunkLength = 800): string[] {
  if (!text || text.trim().length === 0) return [];
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+/g) || [text];

  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length <= maxChunkLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
      }
      if (sentence.length > maxChunkLength) {
        // Fallback: split long sentences by whitespace
        const words = sentence.split(/(\s+)/);
        currentChunk = '';
        for (const w of words) {
          if (currentChunk.length + w.length <= maxChunkLength) {
            currentChunk += w;
          } else {
            if (currentChunk.trim().length > 0) chunks.push(currentChunk);
            currentChunk = w;
          }
        }
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Translation Manager with Request Deduplication, Bounded Chunking,
 * Concurrency Management, Cancellation, and Bounded Caching.
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
    if (signal?.aborted) {
      throw new Error('Translation aborted');
    }

    const src = sourceLang || this.settings.sourceLang;
    const tgt = targetLang || this.settings.targetLang;
    const providerObj = createTranslationProvider(this.settings.provider);

    // If text exceeds chunk limit, chunk and translate incrementally
    const chunks = chunkText(text, 800);
    if (chunks.length > 1) {
      const translatedChunks: string[] = [];
      let detectedLang = src;

      for (const chunk of chunks) {
        if (signal?.aborted) throw new Error('Translation aborted');
        const res = await this.translateSingleChunk(chunk, src, tgt, providerObj, signal);
        translatedChunks.push(res.translatedText);
        if (res.detectedSourceLang) detectedLang = res.detectedSourceLang;
      }

      return {
        translatedText: translatedChunks.join(''),
        detectedSourceLang: detectedLang,
        provider: providerObj.name
      };
    }

    return await this.translateSingleChunk(text, src, tgt, providerObj, signal);
  }

  private async translateSingleChunk(
    text: string,
    sourceLang: string,
    targetLang: string,
    providerObj: TranslationProvider,
    signal?: AbortSignal
  ): Promise<TranslationResponse> {
    const cacheKey = TranslationCache.generateKey(text, sourceLang, targetLang, providerObj.name);

    // 1. Cache hit check
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult !== null) {
      return {
        translatedText: cachedResult,
        detectedSourceLang: sourceLang,
        provider: providerObj.name
      };
    }

    // 2. In-flight request deduplication
    if (this.activeRequests.has(cacheKey)) {
      return await this.activeRequests.get(cacheKey)!;
    }

    // 3. Initiate request with abort signal handling
    const promise = (async () => {
      try {
        if (signal?.aborted) throw new Error('Translation aborted');

        const response = await providerObj.translate({
          text,
          sourceLang,
          targetLang,
          signal
        });

        // Store successful translation in cache
        this.cache.set(cacheKey, text, response.translatedText, sourceLang, targetLang, providerObj.name);
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
