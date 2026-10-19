import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { toast } from 'sonner';
import { useConfig } from '@/contexts/ConfigContext';

export interface Language {
  code: string;
  name: string;
}

// ISO 639-1 language codes supported by Whisper
const LANGUAGES: Language[] = [
  { code: 'auto', name: 'Rilevamento automatico (lingua originale)' },
  { code: 'auto-translate', name: 'Rilevamento automatico (traduci in inglese)' },
  { code: 'en', name: 'Inglese' },
  { code: 'zh', name: 'Cinese' },
  { code: 'de', name: 'Tedesco' },
  { code: 'es', name: 'Spagnolo' },
  { code: 'ru', name: 'Russo' },
  { code: 'ko', name: 'Coreano' },
  { code: 'fr', name: 'Francese' },
  { code: 'ja', name: 'Giapponese' },
  { code: 'pt', name: 'Portoghese' },
  { code: 'tr', name: 'Turco' },
  { code: 'pl', name: 'Polacco' },
  { code: 'ca', name: 'Catalano' },
  { code: 'nl', name: 'Olandese' },
  { code: 'ar', name: 'Arabo' },
  { code: 'sv', name: 'Svedese' },
  { code: 'it', name: 'Italiano' },
  { code: 'id', name: 'Indonesiano' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fi', name: 'Finlandese' },
  { code: 'vi', name: 'Vietnamita' },
  { code: 'he', name: 'Ebraico' },
  { code: 'uk', name: 'Ucraino' },
  { code: 'el', name: 'Greco' },
  { code: 'ms', name: 'Malese' },
  { code: 'cs', name: 'Ceco' },
  { code: 'ro', name: 'Rumeno' },
  { code: 'da', name: 'Danese' },
  { code: 'hu', name: 'Ungherese' },
  { code: 'ta', name: 'Tamil' },
  { code: 'no', name: 'Norvegese' },
  { code: 'th', name: 'Thailandese' },
  { code: 'ur', name: 'Urdu' },
  { code: 'hr', name: 'Croato' },
  { code: 'bg', name: 'Bulgaro' },
  { code: 'lt', name: 'Lituano' },
  { code: 'la', name: 'Latino' },
  { code: 'mi', name: 'Maori' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'cy', name: 'Gallese' },
  { code: 'sk', name: 'Slovacco' },
  { code: 'te', name: 'Telugu' },
  { code: 'fa', name: 'Persiano' },
  { code: 'lv', name: 'Lettone' },
  { code: 'bn', name: 'Bengalese' },
  { code: 'sr', name: 'Serbo' },
  { code: 'az', name: 'Azero' },
  { code: 'sl', name: 'Sloveno' },
  { code: 'kn', name: 'Kannada' },
  { code: 'et', name: 'Estone' },
  { code: 'mk', name: 'Macedone' },
  { code: 'br', name: 'Bretone' },
  { code: 'eu', name: 'Basco' },
  { code: 'is', name: 'Islandese' },
  { code: 'hy', name: 'Armeno' },
  { code: 'ne', name: 'Nepalese' },
  { code: 'mn', name: 'Mongolo' },
  { code: 'bs', name: 'Bosniaco' },
  { code: 'kk', name: 'Kazako' },
  { code: 'sq', name: 'Albanese' },
  { code: 'sw', name: 'Swahili' },
  { code: 'gl', name: 'Galiziano' },
  { code: 'mr', name: 'Marathi' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'si', name: 'Singalese' },
  { code: 'km', name: 'Khmer' },
  { code: 'sn', name: 'Shona' },
  { code: 'yo', name: 'Yoruba' },
  { code: 'so', name: 'Somalo' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'oc', name: 'Occitano' },
  { code: 'ka', name: 'Georgiano' },
  { code: 'be', name: 'Bielorusso' },
  { code: 'tg', name: 'Tagiko' },
  { code: 'sd', name: 'Sindhi' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'am', name: 'Amarico' },
  { code: 'yi', name: 'Yiddish' },
  { code: 'lo', name: 'Lao' },
  { code: 'uz', name: 'Uzbeko' },
  { code: 'fo', name: 'Faroese' },
  { code: 'ht', name: 'Creolo haitiano' },
  { code: 'ps', name: 'Pashtu' },
  { code: 'tk', name: 'Turkmeno' },
  { code: 'nn', name: 'Norvegese nynorsk' },
  { code: 'mt', name: 'Maltese' },
  { code: 'sa', name: 'Sanscrito' },
  { code: 'lb', name: 'Lussemburghese' },
  { code: 'my', name: 'Birmano' },
  { code: 'bo', name: 'Tibetano' },
  { code: 'tl', name: 'Tagalog' },
  { code: 'mg', name: 'Malgascio' },
  { code: 'as', name: 'Assamese' },
  { code: 'tt', name: 'Tataro' },
  { code: 'haw', name: 'Hawaiano' },
  { code: 'ln', name: 'Lingala' },
  { code: 'ha', name: 'Hausa' },
  { code: 'ba', name: 'Baschiro' },
  { code: 'jw', name: 'Giavanese' },
  { code: 'su', name: 'Sundanese' },
];

interface LanguageSelectionProps {
  selectedLanguage: string;
  onLanguageChange: (language: string) => void;
  disabled?: boolean;
  provider?: 'localWhisper' | 'parakeet' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai';
}

export function LanguageSelection({
  selectedLanguage,
  onLanguageChange,
  disabled = false,
  provider = 'localWhisper'
}: LanguageSelectionProps) {
  const [saving, setSaving] = useState(false);
  const { setSelectedLanguage } = useConfig();

  // Parakeet only supports auto-detection (doesn't support manual language selection)
  const isParakeet = provider === 'parakeet';
  const availableLanguages = isParakeet
    ? LANGUAGES.filter(lang => lang.code === 'auto' || lang.code === 'auto-translate')
    : LANGUAGES;

  const handleLanguageChange = async (languageCode: string) => {
    setSaving(true);
    try {
      // Save language preference to localStorage and sync to backend
      setSelectedLanguage(languageCode);
      onLanguageChange(languageCode);
      console.log('Language preference saved:', languageCode);

      // Track language selection analytics
      const selectedLang = LANGUAGES.find(lang => lang.code === languageCode);
      await Analytics.track('language_selected', {
        language_code: languageCode,
        language_name: selectedLang?.name || 'Unknown',
        is_auto_detect: (languageCode === 'auto').toString(),
        is_auto_translate: (languageCode === 'auto-translate').toString()
      });

      // Show success toast
      const languageName = selectedLang?.name || languageCode;
      toast.success("Lingua salvata", {
        description: `Lingua della trascrizione: ${languageName}`
      });
    } catch (error) {
      console.error('Failed to save language preference:', error);
      toast.error("Impossibile salvare la lingua", {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSaving(false);
    }
  };

  // Find the selected language name for display
  const selectedLanguageName = LANGUAGES.find(
    lang => lang.code === selectedLanguage
  )?.name || 'Rilevamento automatico (lingua originale)';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-600" />
          <h4 className="text-sm font-medium text-gray-900">Lingua della trascrizione</h4>
        </div>
      </div>

      <div className="space-y-2">
        <select
          value={selectedLanguage}
          onChange={(e) => handleLanguageChange(e.target.value)}
          disabled={disabled || saving}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        >
          {availableLanguages.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
              {language.code !== 'auto' && language.code !== 'auto-translate' && ` (${language.code})`}
            </option>
          ))}
        </select>

        {/* Parakeet language limitation warning */}
        {isParakeet && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
            <p className="font-medium">ℹ️ Lingue supportate da Parakeet</p>
            <p className="mt-1 text-xs">Parakeet rileva la lingua automaticamente e non permette di sceglierla. Usa Whisper se vuoi indicare una lingua precisa.</p>
          </div>
        )}

        {/* Info text */}
        <div className="text-xs space-y-2 pt-2">
          <p className="text-gray-600">
            <strong>Attuale:</strong> {selectedLanguageName}
          </p>
          {selectedLanguage === 'auto' && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
              <p className="font-medium">⚠️ Il rilevamento automatico può sbagliare</p>
              <p className="mt-1">Per la massima precisione scegli la lingua della riunione (es. italiano)</p>
            </div>
          )}
          {selectedLanguage === 'auto-translate' && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-blue-800">
              <p className="font-medium">🌐 Traduzione attiva</p>
              <p className="mt-1">Tutto l'audio verrà tradotto in inglese. Utile per riunioni multilingue.</p>
            </div>
          )}
          {selectedLanguage !== 'auto' && selectedLanguage !== 'auto-translate' && (
            <p className="text-gray-600">
              Transcription will be optimized for <strong>{selectedLanguageName}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
