import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import translation files
import koCommon from '@/locales/ko/common.json'
import koNavigation from '@/locales/ko/navigation.json'
import koProjects from '@/locales/ko/projects.json'
import koTemplates from '@/locales/ko/templates.json'
import koDocuments from '@/locales/ko/documents.json'
import koSettings from '@/locales/ko/settings.json'

import enCommon from '@/locales/en/common.json'
import enNavigation from '@/locales/en/navigation.json'
import enProjects from '@/locales/en/projects.json'
import enTemplates from '@/locales/en/templates.json'
import enDocuments from '@/locales/en/documents.json'
import enSettings from '@/locales/en/settings.json'

// Language resources
const resources = {
  ko: {
    common: koCommon,
    navigation: koNavigation,
    projects: koProjects,
    templates: koTemplates,
    documents: koDocuments,
    settings: koSettings,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    projects: enProjects,
    templates: enTemplates,
    documents: enDocuments,
    settings: enSettings,
  },
}

// Get stored language or detect browser language
function getInitialLanguage(): string {
  // Check localStorage
  const storedLang = localStorage.getItem('language')
  if (storedLang && ['ko', 'en'].includes(storedLang)) {
    return storedLang
  }

  // Detect browser language
  const browserLang = navigator.language.split('-')[0]
  if (['ko', 'en'].includes(browserLang)) {
    return browserLang
  }

  // Default to Korean
  return 'ko'
}

// Initialize i18n
i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: 'ko',
  defaultNS: 'common',
  ns: ['common', 'navigation', 'projects', 'templates', 'documents', 'settings'],
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  react: {
    useSuspense: false,
  },
})

// Change language and persist to localStorage
export function changeLanguage(lang: string) {
  i18n.changeLanguage(lang)
  localStorage.setItem('language', lang)
}

// Get current language
export function getCurrentLanguage(): string {
  return i18n.language
}

// Supported languages
export const SUPPORTED_LANGUAGES = [
  { code: 'ko', name: '한국어', nativeName: '한국어' },
  { code: 'en', name: 'English', nativeName: 'English' },
]

export default i18n
