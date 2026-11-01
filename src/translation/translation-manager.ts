import { TranslationCacheEntry, TranslationSettings } from '../shared/types';
import { createTranslationProvider, TranslationProvider, TranslationResponse } from './provider';

export const MAX_CHUNK_LENGTH = 800;

/**
 * Splits text into bounded chunks respecting sentence and word boundaries.
 */
export function chunkText(text: string, maxChunkLen = MAX_CHUNK_LENGTH): string[] {
  if (!text || text.length <= maxChunkLen) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkLen) {
      chunks.push(remaining);
      break;
    }

    // Try finding punctuation boundary (. ! ? \n) within maxChunkLen
    const slice = remaining.slice(0, maxChunkLen);
    let splitIdx = -1;

    for (const punct of ['\n', '. ', '! ', '? ', '؛ ', '، ']) {
      const idx = slice.lastIndexOf(punct);
      if (idx > splitIdx && idx >= Math.floor(maxChunkLen * 0.3)) {
        splitIdx = idx + punct.length;
      }
    }

    // If no punctuation boundary found, split on last space
    if (splitIdx === -1) {
      const spaceIdx = slice.lastIndexOf(' ');
      if (spaceIdx > 0 && spaceIdx >= Math.floor(maxChunkLen * 0.3)) {
        splitIdx = spaceIdx + 1;
      } else {
        // Fallback to hard limit
        splitIdx = maxChunkLen;
      }
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx);
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
 * Cancellation (AbortSignal), Bounded Chunking, and Bounded Caching.
 */
export class TranslationManager {
  private cache: TranslationCache;
  private settings: TranslationSettings;
  private activeRequests = new Map<string, Promise<TranslationResponse>>();
  private currentRunning = 0;
  private queue: Array<() => void> = [];

  constructor(settings: TranslationSettings) {
    this.settings = settings;
    this.cache = new TranslationCache(settings.maxCacheEntries, settings.cacheTTLMs);
  }

  updateSettings(settings: TranslationSettings): void {
    this.settings = settings;
    this.cache = new TranslationCache(settings.maxCacheEntries, settings.cacheTTLMs);
  }

  private async acquireSlot(): Promise<void> {
    const limit = Math.max(1, this.settings.concurrencyLimit || 1);
    if (this.currentRunning < limit) {
      this.currentRunning++;
      return;
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.currentRunning++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.currentRunning = Math.max(0, this.currentRunning - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  /**
   * Translates arbitrary length text by chunking large passages into bounded units,
   * preserving memory and respecting provider payload limits.
   */
  async translateText(text: string, sourceLang?: string, targetLang?: string, signal?: AbortSignal): Promise<TranslationResponse> {
    if (signal?.aborted) {
      throw new Error('Translation aborted');
    }

    const src = sourceLang || this.settings.sourceLang;
    const tgt = targetLang || this.settings.targetLang;
    const chunks = chunkText(text, MAX_CHUNK_LENGTH);

    if (chunks.length === 1) {
      return this.translateSingleChunk(chunks[0], src, tgt, signal);
    }

    // Translate multiple chunks sequentially or respecting concurrency
    const translatedParts: string[] = [];
    let detectedSource = src;
    let providerName = '';

    for (const chunk of chunks) {
      if (signal?.aborted) {
        throw new Error('Translation aborted');
      }
      const partRes = await this.translateSingleChunk(chunk, src, tgt, signal);
      translatedParts.push(partRes.translatedText);
      detectedSource = partRes.detectedSourceLang || detectedSource;
      providerName = partRes.provider;
    }

    return {
      translatedText: translatedParts.join(''),
      detectedSourceLang: detectedSource,
      provider: providerName
    };
  }

  private async translateSingleChunk(text: string, src: string, tgt: string, signal?: AbortSignal): Promise<TranslationResponse> {
    const providerObj = createTranslationProvider(this.settings.provider);
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

    // 3. Queue slot acquisition and execution
    const promise = (async () => {
      await this.acquireSlot();
      try {
        if (signal?.aborted) {
          throw new Error('Translation aborted');
        }

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
        this.releaseSlot();
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
