/**
 * Lightweight language detector using HTML lang, meta headers,
 * character range heuristics (e.g., Arabic, Cyrillic, CJK, Latin), and common stopwords.
 */

export interface DetectedLanguage {
  lang: string;
  confidence: number;
  isRTL: boolean;
}

const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'yi']);

export function isRTL(langCode: string): boolean {
  if (!langCode) return false;
  const primary = langCode.toLowerCase().split('-')[0];
  return RTL_LANGUAGES.has(primary);
}

export function detectLanguage(text: string, docLang?: string): DetectedLanguage {
  if (docLang && docLang !== 'auto' && docLang.length >= 2) {
    const cleanLang = docLang.toLowerCase().trim().split('-')[0];
    return {
      lang: cleanLang,
      confidence: 0.9,
      isRTL: isRTL(cleanLang)
    };
  }

  if (!text || text.trim().length === 0) {
    return { lang: 'en', confidence: 0.1, isRTL: false };
  }

  const sample = text.slice(0, 1000);

  // Character set analysis
  let arabicCount = 0;
  let cyrillicCount = 0;
  let cjkCount = 0;
  let latinCount = 0;

  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code >= 0x0600 && code <= 0x06FF) arabicCount++; // Arabic
    else if (code >= 0x0400 && code <= 0x04FF) cyrillicCount++; // Cyrillic
    else if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3040 && code <= 0x30FF)) cjkCount++; // CJK
    else if ((code >= 0x0041 && code <= 0x005A) || (code >= 0x0061 && code <= 0x007A)) latinCount++;
  }

  const totalChars = sample.length;

  if (arabicCount / totalChars > 0.15) {
    return { lang: 'ar', confidence: 0.95, isRTL: true };
  }
  if (cyrillicCount / totalChars > 0.15) {
    return { lang: 'ru', confidence: 0.9, isRTL: false };
  }
  if (cjkCount / totalChars > 0.15) {
    return { lang: 'zh', confidence: 0.9, isRTL: false };
  }

  // French vs English Latin Heuristics
  const lower = sample.toLowerCase();
  const frenchWords = ['bonjour', 'le', 'la', 'les', 'des', 'du', 'est', 'dans', 'pour', 'une', 'un', 'monde', 'merci', 'oui', 'non'];
  const words = lower.split(/\s+/);
  let frenchScore = 0;
  for (const w of words) {
    if (frenchWords.includes(w)) frenchScore++;
  }

  if (frenchScore >= 1 || lower.includes('é') || lower.includes('è') || lower.includes('à') || lower.includes('ç')) {
    return { lang: 'fr', confidence: 0.8, isRTL: false };
  }

  return { lang: 'en', confidence: 0.7, isRTL: false };
}
