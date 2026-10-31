import { TranslationCacheEntry, TranslationSettings, PrivacySettings } from '../shared/types';
import { createTranslationProvider, TranslationProvider, TranslationResponse } from './provider';

export const MAX_CHUNK_LENGTH = 800;

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
 * Concurrency limiter that bounds active translation operations.
 */
export class ConcurrencyLimiter {
  private limit: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(limit = 1) {
    this.limit = Math.max(1, limit);
  }

  setLimit(limit: number): void {
    this.limit = Math.max(1, limit);
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }
}

/**
 * Splits text into bounded chunks along sentence and word boundaries.
 */
export function chunkText(text: string, maxLen = MAX_CHUNK_LENGTH): string[] {
  if (!text || text.length <= maxLen) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split(/(\n+)/);
  let currentChunk = '';

  for (const segment of paragraphs) {
    if (currentChunk.length + segment.length <= maxLen) {
      currentChunk += segment;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      if (segment.length <= maxLen) {
        currentChunk = segment;
      } else {
        // Sentence split
        const sentences = segment.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [segment];
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length <= maxLen) {
            currentChunk += sentence;
          } else {
            if (currentChunk.length > 0) {
              chunks.push(currentChunk);
              currentChunk = '';
            }
            if (sentence.length <= maxLen) {
              currentChunk = sentence;
            } else {
              // Word split fallback
              const words = sentence.split(/(\s+)/);
              for (const word of words) {
                if (currentChunk.length + word.length <= maxLen) {
                  currentChunk += word;
                } else {
                  if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                  }
                  currentChunk = word;
                }
              }
            }
          }
        }
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Translation Manager with Request Deduplication, Concurrency Management,
 * Cancellation, Chunking, Privacy Consent, and Bounded Caching.
 */
export class TranslationManager {
  private cache: TranslationCache;
  private settings: TranslationSettings;
  private privacy?: PrivacySettings;
  private limiter: ConcurrencyLimiter;
  private activeRequests = new Map<string, Promise<TranslationResponse>>();

  constructor(settings: TranslationSettings, privacy?: PrivacySettings) {
    this.settings = settings;
    this.privacy = privacy;
    this.cache = new TranslationCache(settings.maxCacheEntries, settings.cacheTTLMs);
    this.limiter = new ConcurrencyLimiter(settings.concurrencyLimit || 1);
  }

  updateSettings(settings: TranslationSettings, privacy?: PrivacySettings): void {
    this.settings = settings;
    if (privacy) this.privacy = privacy;
    this.cache = new TranslationCache(settings.maxCacheEntries, settings.cacheTTLMs);
    this.limiter.setLimit(settings.concurrencyLimit || 1);
  }

  /**
   * Translates text, automatically handling chunking for long text,
   * checking privacy consent for external APIs, deduplicating identical requests,
   * bounding concurrency, and caching results.
   */
  async translateText(text: string, sourceLang?: string, targetLang?: string, signal?: AbortSignal): Promise<TranslationResponse> {
    if (!text || text.trim().length === 0) {
      return { translatedText: text, provider: this.settings.provider.type };
    }

    if (signal?.aborted) {
      throw new Error('Translation aborted');
    }

    // Privacy Consent Validation
    if (this.settings.provider.type === 'custom_api') {
      if (!this.privacy?.sendPageContentConsent) {
        throw new Error('Privacy consent required: Grant consent in extension settings to transmit text to external translation APIs.');
      }
    }

    const src = sourceLang || this.settings.sourceLang;
    const tgt = targetLang || this.settings.targetLang;
    const providerObj = createTranslationProvider(this.settings.provider);

    // If text exceeds bounded chunk size, chunk and translate incrementally
    const chunks = chunkText(text, MAX_CHUNK_LENGTH);
    if (chunks.length > 1) {
      const translatedParts: string[] = [];
      let detectedLang: string | undefined;

      for (const chunk of chunks) {
        if (signal?.aborted) {
          throw new Error('Translation aborted');
        }
        const chunkResult = await this.translateSingleChunk(chunk, src, tgt, providerObj, signal);
        translatedParts.push(chunkResult.translatedText);
        if (!detectedLang && chunkResult.detectedSourceLang) {
          detectedLang = chunkResult.detectedSourceLang;
        }
      }

      return {
        translatedText: translatedParts.join(''),
        detectedSourceLang: detectedLang || src,
        provider: providerObj.name
      };
    }

    return await this.translateSingleChunk(text, src, tgt, providerObj, signal);
  }

  private async translateSingleChunk(
    text: string,
    src: string,
    tgt: string,
    providerObj: TranslationProvider,
    signal?: AbortSignal
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

    // 3. Initiate request through concurrency limiter
    const promise = this.limiter.run(async () => {
      if (signal?.aborted) {
        throw new Error('Translation aborted');
      }

      const response = await providerObj.translate({
        text,
        sourceLang: src,
        targetLang: tgt,
        signal
      });

      // Never cache aborted or empty results
      if (!signal?.aborted && response.translatedText) {
        this.cache.set(cacheKey, text, response.translatedText, src, tgt, providerObj.name);
      }

      return response;
    }).finally(() => {
      this.activeRequests.delete(cacheKey);
    });

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
