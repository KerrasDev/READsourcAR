/**
 * Progressive Language & RTL Detector using HTML lang attributes,
 * meta headers, character range analysis, and stopwords.
 */

export interface DetectedLanguage {
  lang: string;
  confidence: number;
  isRTL: boolean;
}

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi']);

export function isRTL(langCode: string): boolean {
  if (!langCode) return false;
  const primary = langCode.toLowerCase().split('-')[0].trim();
  return RTL_LANGUAGES.has(primary);
}

/**
 * Detects the document or sample text language progressively.
 */
export function detectLanguage(text: string, docLang?: string, metaLang?: string): DetectedLanguage {
  // 1. Explicit HTML docLang
  if (docLang && docLang !== 'auto' && docLang.trim().length >= 2) {
    const clean = docLang.toLowerCase().trim().split('-')[0];
    return {
      lang: clean,
      confidence: 0.95,
      isRTL: isRTL(clean)
    };
  }

  // 2. HTML Meta tags (content-language or language)
  if (metaLang && metaLang !== 'auto' && metaLang.trim().length >= 2) {
    const clean = metaLang.toLowerCase().trim().split('-')[0];
    return {
      lang: clean,
      confidence: 0.9,
      isRTL: isRTL(clean)
    };
  }

  // 3. Fallback to empty text
  if (!text || text.trim().length === 0) {
    return { lang: 'en', confidence: 0.2, isRTL: false };
  }

  const sample = text.slice(0, 1500);

  // Character range analysis
  let arabicCount = 0;
  let hebrewCount = 0;
  let cyrillicCount = 0;
  let cjkCount = 0;
  let latinCount = 0;

  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if ((code >= 0x0600 && code <= 0x06FF) || (code >= 0x0750 && code <= 0x077F) || (code >= 0x08A0 && code <= 0x08FF)) {
      arabicCount++;
    } else if (code >= 0x0590 && code <= 0x05FF) {
      hebrewCount++;
    } else if (code >= 0x0400 && code <= 0x04FF) {
      cyrillicCount++;
    } else if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3040 && code <= 0x30FF)) {
      cjkCount++;
    } else if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A)) {
      latinCount++;
    }
  }

  const totalChars = sample.length;

  if (arabicCount / totalChars > 0.1) {
    return { lang: 'ar', confidence: 0.95, isRTL: true };
  }

  if (hebrewCount / totalChars > 0.1) {
    return { lang: 'he', confidence: 0.95, isRTL: true };
  }

  if (cyrillicCount / totalChars > 0.1) {
    return { lang: 'ru', confidence: 0.9, isRTL: false };
  }

  if (cjkCount / totalChars > 0.1) {
    return { lang: 'zh', confidence: 0.9, isRTL: false };
  }

  // Latin text analysis: French vs Spanish vs English
  const lower = sample.toLowerCase();

  // French indicators
  const frenchWords = new Set(['bonjour', 'le', 'la', 'les', 'des', 'du', 'est', 'dans', 'pour', 'une', 'un', 'monde', 'merci', 'oui', 'non', 'avec', 'vous', 'nous', 'cette']);
  // Spanish indicators
  const spanishWords = new Set(['hola', 'el', 'los', 'las', 'por', 'para', 'una', 'uno', 'mundo', 'gracias', 'este', 'esta', 'pero', 'como']);

  const words = lower.split(/[\s,.;:!?()\[\]{}"']+/).filter(Boolean);
  let frenchScore = 0;
  let spanishScore = 0;

  for (const w of words) {
    if (frenchWords.has(w)) frenchScore++;
    if (spanishWords.has(w)) spanishScore++;
  }

  if (/[éèàçùœêîôû]/.test(lower)) frenchScore += 2;
  if (/[áíóúñ¿¡]/.test(lower)) spanishScore += 2;

  if (frenchScore > spanishScore && frenchScore >= 2) {
    return { lang: 'fr', confidence: 0.85, isRTL: false };
  }

  if (spanishScore > frenchScore && spanishScore >= 2) {
    return { lang: 'es', confidence: 0.85, isRTL: false };
  }

  return { lang: 'en', confidence: 0.7, isRTL: false };
}
