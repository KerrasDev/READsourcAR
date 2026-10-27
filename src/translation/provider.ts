import { TranslationProviderConfig } from '../shared/types';

export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
  signal?: AbortSignal;
}

export interface TranslationResponse {
  translatedText: string;
  detectedSourceLang?: string;
  provider: string;
}

export interface TranslationProvider {
  name: string;
  translate(req: TranslationRequest): Promise<TranslationResponse>;
}

export class MockTranslationProvider implements TranslationProvider {
  name = 'mock';

  async translate(req: TranslationRequest): Promise<TranslationResponse> {
    if (req.signal?.aborted) {
      throw new Error('Translation aborted');
    }

    // Simulate short network latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (req.signal?.aborted) {
      throw new Error('Translation aborted');
    }

    let result = req.text;
    if (req.targetLang === 'es') {
      result = `[ES] ${req.text}`;
    } else if (req.targetLang === 'fr') {
      result = `[FR] ${req.text}`;
    } else if (req.targetLang === 'ar') {
      result = `[AR] ${req.text}`;
    } else {
      result = `[${req.targetLang.toUpperCase()}] ${req.text}`;
    }

    return {
      translatedText: result,
      detectedSourceLang: req.sourceLang === 'auto' ? 'en' : req.sourceLang,
      provider: this.name
    };
  }
}

export class ManualTranslationProvider implements TranslationProvider {
  name = 'manual';

  async translate(req: TranslationRequest): Promise<TranslationResponse> {
    return {
      translatedText: req.text, // Returns original for copy-paste workflow
      detectedSourceLang: req.sourceLang,
      provider: this.name
    };
  }
}

export class CustomAPITranslationProvider implements TranslationProvider {
  name = 'custom_api';
  private config: TranslationProviderConfig;
  private hasConsent: boolean;

  constructor(config: TranslationProviderConfig, hasConsent: boolean = false) {
    this.config = config;
    this.hasConsent = hasConsent;
  }

  async translate(req: TranslationRequest): Promise<TranslationResponse> {
    if (!this.hasConsent) {
      throw new Error('User consent required for transmitting page content to external translation provider');
    }

    if (!this.config.endpoint) {
      throw new Error('Custom API endpoint not configured');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.customHeaders || {})
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        q: req.text,
        source: req.sourceLang,
        target: req.targetLang
      }),
      signal: req.signal
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      translatedText: data.translatedText || data.result || req.text,
      detectedSourceLang: data.detectedSourceLang || req.sourceLang,
      provider: this.name
    };
  }
}

export function createTranslationProvider(
  config: TranslationProviderConfig,
  sendPageContentConsent: boolean = false
): TranslationProvider {
  switch (config.type) {
    case 'manual':
      return new ManualTranslationProvider();
    case 'custom_api':
      return new CustomAPITranslationProvider(config, sendPageContentConsent);
    case 'mock':
    default:
      return new MockTranslationProvider();
  }
}
