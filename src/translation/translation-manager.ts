import { TranslationCacheEntry, TranslationSettings } from '../shared/types';
import { createTranslationProvider, TranslationProvider, TranslationResponse } from './provider';

/**
 * Splits large text into bounded chunks (max characters, default 800)
 * splitting by sentences or line breaks to preserve semantic context and avoid
 * huge payload transmissions.
 */
export function chunkText(text: string, maxChunkLength = 800): string[] {
  if (!text || text.length <= maxChunkLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkLength) {
      chunks.push(remaining);
      break;
    }

    // Attempt to break at paragraph or newline first
    let splitIdx = remaining.lastIndexOf('\n', maxChunkLength);
    if (splitIdx < maxChunkLength * 0.3) {
      // Look for sentence terminator (., !, ?, or Arabic/CJK equivalents)
      const sentenceRegex = /[.!?。！？\n]\s+/g;
      let match: RegExpExecArray | null;
      let lastMatchIdx = -1;

      while ((match = sentenceRegex.exec(remaining.slice(0, maxChunkLength))) !== null) {
        lastMatchIdx = match.index + match[0].length;
      }

      if (lastMatchIdx > maxChunkLength * 0.3) {
        splitIdx = lastMatchIdx;
      } else {
        // Fallback to word break
        splitIdx = remaining.lastIndexOf(' ', maxChunkLength);
      }
    }

    // Hard fallback if no whitespace or punctuation found
    if (splitIdx <= 0) {
      splitIdx = maxChunkLength;
    }

    const chunk = remaining.slice(0, splitIdx);
    chunks.push(chunk);
    remaining = remaining.slice(splitIdx).trimStart();
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

  /**
   * Translates text. Automatically chunks text longer than 800 characters
   * and translates chunks sequentially while respecting AbortSignal.
   */
  async translateText(text: string, sourceLang?: string, targetLang?: string, signal?: AbortSignal): Promise<TranslationResponse> {
    if (signal?.aborted) {
      throw new Error('Translation aborted');
    }

    const src = sourceLang || this.settings.sourceLang;
    const tgt = targetLang || this.settings.targetLang;
    const providerObj = createTranslationProvider(this.settings.provider);

    // If text exceeds 800 characters, handle via bounded chunking
    if (text.length > 800) {
      const chunks = chunkText(text, 800);
      const translatedParts: string[] = [];
      let detectedSource = src;

      for (const chunk of chunks) {
        if (signal?.aborted) {
          throw new Error('Translation aborted');
        }
        const chunkRes = await this.translateSingleChunk(chunk, src, tgt, providerObj, signal);
        translatedParts.push(chunkRes.translatedText);
        if (chunkRes.detectedSourceLang) {
          detectedSource = chunkRes.detectedSourceLang;
        }
      }

      return {
        translatedText: translatedParts.join(' '),
        detectedSourceLang: detectedSource,
        provider: providerObj.name
      };
    }

    return await this.translateSingleChunk(text, src, tgt, providerObj, signal);
  }

  private async translateSingleChunk(
    chunk: string,
    src: string,
    tgt: string,
    providerObj: TranslationProvider,
    signal?: AbortSignal
  ): Promise<TranslationResponse> {
    const cacheKey = TranslationCache.generateKey(chunk, src, tgt, providerObj.name);

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

    // 3. Initiate request with cancellation
    const promise = (async () => {
      try {
        const response = await providerObj.translate({
          text: chunk,
          sourceLang: src,
          targetLang: tgt,
          signal
        });

        // Store successful translation in cache
        this.cache.set(cacheKey, chunk, response.translatedText, src, tgt, providerObj.name);
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
