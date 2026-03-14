const fs = require('node:fs/promises');
const path = require('node:path');

const API_URL = 'https://bible.helloao.org/api/available_translations.json';
const DATA_DIR = path.join(process.cwd(), 'content', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'available-translations-summary.json');
const PRODUCTION_READY_OUTPUT_PATH = path.join(DATA_DIR, 'available-translations-production-ready.json');
const TOP_10_OUTPUT_PATH = path.join(DATA_DIR, 'production-ready-top-10-languages.json');
const PRIORITY_OUTPUT_PATH = path.join(DATA_DIR, 'production-ready-priority-languages.json');

const CANONICAL_BOOK_COUNT = 66;
const CANONICAL_CHAPTER_COUNT = 1189;

const PRIORITY_LANGUAGE_CODES = ['eng', 'spa', 'cmn', 'hin', 'por', 'rus', 'jpn', 'arb'];
const TOP_SPOKEN_LANGUAGE_CODES = ['eng', 'cmn', 'hin', 'spa', 'arb', 'fra', 'ben', 'por', 'rus', 'urd'];

function normalizeTranslation(translation) {
    return {
        id: translation.id,
        name: translation.name,
        englishName: translation.englishName,
        licenseUrl: translation.licenseUrl,
        language: translation.language,
        languageName: translation.languageName ?? null,
        languageEnglishName: translation.languageEnglishName ?? null,
        textDirection: translation.textDirection,
        numberOfBooks: translation.numberOfBooks,
        totalNumberOfChapters: translation.totalNumberOfChapters,
        totalNumberOfVerses: translation.totalNumberOfVerses,
        availableFormats: translation.availableFormats,
    };
}

function isProductionReady(translation) {
    const formats = Array.isArray(translation.availableFormats) ? translation.availableFormats : [];

    return (
        typeof translation.id === 'string' && translation.id.length > 0 &&
        typeof translation.name === 'string' && translation.name.length > 0 &&
        typeof translation.englishName === 'string' && translation.englishName.length > 0 &&
        typeof translation.licenseUrl === 'string' && translation.licenseUrl.length > 0 &&
        typeof translation.language === 'string' && translation.language.length > 0 &&
        (translation.textDirection === 'ltr' || translation.textDirection === 'rtl') &&
        translation.numberOfBooks === CANONICAL_BOOK_COUNT &&
        translation.totalNumberOfChapters === CANONICAL_CHAPTER_COUNT &&
        typeof translation.totalNumberOfVerses === 'number' && translation.totalNumberOfVerses > 0 &&
        formats.includes('json')
    );
}

function buildLanguageSummary(translations) {
    const languageMap = new Map();

    for (const translation of translations) {
        const key = translation.language || 'unknown';
        const existing = languageMap.get(key) ?? {
            language: key,
            languageName: translation.languageName,
            languageEnglishName: translation.languageEnglishName,
            textDirection: translation.textDirection,
            translationCount: 0,
        };

        existing.translationCount += 1;

        if (!existing.languageName && translation.languageName) {
            existing.languageName = translation.languageName;
        }
        if (!existing.languageEnglishName && translation.languageEnglishName) {
            existing.languageEnglishName = translation.languageEnglishName;
        }

        languageMap.set(key, existing);
    }

    return Array.from(languageMap.values()).sort((a, b) => {
        if (b.translationCount !== a.translationCount) {
            return b.translationCount - a.translationCount;
        }
        return String(a.language).localeCompare(String(b.language));
    });
}

function byNameSort(a, b) {
    return a.name.localeCompare(b.name);
}

function getMissingProductionCriteria(translation) {
    const formats = Array.isArray(translation.availableFormats) ? translation.availableFormats : [];
    const missing = [];

    if (!(typeof translation.id === 'string' && translation.id.length > 0)) missing.push('id');
    if (!(typeof translation.name === 'string' && translation.name.length > 0)) missing.push('name');
    if (!(typeof translation.englishName === 'string' && translation.englishName.length > 0)) missing.push('englishName');
    if (!(typeof translation.licenseUrl === 'string' && translation.licenseUrl.length > 0)) missing.push('licenseUrl');
    if (!(typeof translation.language === 'string' && translation.language.length > 0)) missing.push('language');
    if (!(translation.textDirection === 'ltr' || translation.textDirection === 'rtl')) missing.push('textDirection');
    if (translation.numberOfBooks !== CANONICAL_BOOK_COUNT) missing.push('canonicalBooks');
    if (translation.totalNumberOfChapters !== CANONICAL_CHAPTER_COUNT) missing.push('canonicalChapters');
    if (!(typeof translation.totalNumberOfVerses === 'number' && translation.totalNumberOfVerses > 0)) missing.push('totalNumberOfVerses');
    if (!formats.includes('json')) missing.push('jsonFormat');

    return missing;
}

function scoreFallbackCandidate(translation) {
    const formats = Array.isArray(translation.availableFormats) ? translation.availableFormats : [];
    let score = 0;

    if (formats.includes('json')) score += 100;
    score += Math.min(translation.numberOfBooks ?? 0, CANONICAL_BOOK_COUNT);
    score += Math.min(Math.floor((translation.totalNumberOfChapters ?? 0) / 10), Math.floor(CANONICAL_CHAPTER_COUNT / 10));

    if (typeof translation.licenseUrl === 'string' && translation.licenseUrl.length > 0) score += 10;
    if (translation.textDirection === 'ltr' || translation.textDirection === 'rtl') score += 5;

    return score;
}

function getBestFallbackTranslation(translationsInLanguage) {
    if (!translationsInLanguage.length) {
        return null;
    }

    const sorted = [...translationsInLanguage].sort((a, b) => {
        const scoreDiff = scoreFallbackCandidate(b) - scoreFallbackCandidate(a);
        if (scoreDiff !== 0) return scoreDiff;

        const bookDiff = (b.numberOfBooks ?? 0) - (a.numberOfBooks ?? 0);
        if (bookDiff !== 0) return bookDiff;

        const chapterDiff = (b.totalNumberOfChapters ?? 0) - (a.totalNumberOfChapters ?? 0);
        if (chapterDiff !== 0) return chapterDiff;

        return byNameSort(a, b);
    });

    const candidate = sorted[0];
    return {
        ...candidate,
        missingProductionCriteria: getMissingProductionCriteria(candidate),
    };
}

async function fetchAndWriteTranslations() {
    const response = await fetch(API_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch translations: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const translations = Array.isArray(payload?.translations) ? payload.translations : [];

        const translationSummary = translations.map(normalizeTranslation).sort(byNameSort);
        const languageSummary = buildLanguageSummary(translationSummary);

        const productionReadyTranslations = translationSummary.filter(isProductionReady).sort(byNameSort);
        const productionReadyLanguageSummary = buildLanguageSummary(productionReadyTranslations);

        const topTenLanguages = TOP_SPOKEN_LANGUAGE_CODES.map((languageCode, index) => {
            const allInLanguage = translationSummary.filter((translation) => translation.language === languageCode);
            const productionReadyInLanguage = productionReadyTranslations
                .filter((translation) => translation.language === languageCode)
                .sort(byNameSort);
            const topLanguageEntry = languageSummary.find((entry) => entry.language === languageCode) ?? null;

            return {
                rankByGlobalSpeakers: index + 1,
                language: languageCode,
                languageName: topLanguageEntry?.languageName ?? null,
                languageEnglishName: topLanguageEntry?.languageEnglishName ?? null,
                textDirection: topLanguageEntry?.textDirection ?? null,
                translationCount: allInLanguage.length,
                productionReadyTranslationCount: productionReadyInLanguage.length,
                productionReadyTranslations: productionReadyInLanguage,
            };
        });

        const priorityLanguages = PRIORITY_LANGUAGE_CODES.map((languageCode) => {
            const allInLanguage = translationSummary.filter((translation) => translation.language === languageCode);
            const productionReadyInLanguage = productionReadyTranslations.filter((translation) => translation.language === languageCode);
            const topLanguageEntry = languageSummary.find((entry) => entry.language === languageCode) ?? null;

            return {
                language: languageCode,
                languageName: topLanguageEntry?.languageName ?? null,
                languageEnglishName: topLanguageEntry?.languageEnglishName ?? null,
                textDirection: topLanguageEntry?.textDirection ?? null,
                totalTranslations: allInLanguage.length,
                productionReadyTranslationCount: productionReadyInLanguage.length,
                productionReadyTranslations: productionReadyInLanguage.sort(byNameSort),
                fallbackTranslation: productionReadyInLanguage.length === 0 ? getBestFallbackTranslation(allInLanguage) : null,
            };
        });

    const output = {
        generatedAt: new Date().toISOString(),
        source: API_URL,
        totals: {
            translations: translationSummary.length,
            languages: languageSummary.length,
        },
        languageSummary,
        translations: translationSummary,
    };

        const productionReadyOutput = {
            generatedAt: new Date().toISOString(),
            source: API_URL,
            productionCriteria: {
                requiredFields: ['id', 'name', 'englishName', 'licenseUrl', 'language', 'textDirection'],
                requiredFormat: 'json',
                canonicalBooks: CANONICAL_BOOK_COUNT,
                canonicalChapters: CANONICAL_CHAPTER_COUNT,
            },
            totals: {
                productionReadyTranslations: productionReadyTranslations.length,
                fullySupportedLanguages: productionReadyLanguageSummary.length,
            },
            languageSummary: productionReadyLanguageSummary,
            translations: productionReadyTranslations,
        };

        const topTenOutput = {
            generatedAt: new Date().toISOString(),
            source: API_URL,
            basedOn: 'Top 10 languages by estimated global speakers',
            languageOrder: TOP_SPOKEN_LANGUAGE_CODES,
            languages: topTenLanguages,
        };

        const priorityOutput = {
            generatedAt: new Date().toISOString(),
            source: API_URL,
            requestedLanguages: PRIORITY_LANGUAGE_CODES,
            languages: priorityLanguages,
        };

        await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
        await fs.writeFile(PRODUCTION_READY_OUTPUT_PATH, `${JSON.stringify(productionReadyOutput, null, 2)}\n`, 'utf8');
        await fs.writeFile(TOP_10_OUTPUT_PATH, `${JSON.stringify(topTenOutput, null, 2)}\n`, 'utf8');
        await fs.writeFile(PRIORITY_OUTPUT_PATH, `${JSON.stringify(priorityOutput, null, 2)}\n`, 'utf8');

        console.log(`Wrote full summary to ${OUTPUT_PATH}`);
        console.log(`Wrote production-ready summary to ${PRODUCTION_READY_OUTPUT_PATH}`);
        console.log(`Wrote top-10 production-ready language export to ${TOP_10_OUTPUT_PATH}`);
        console.log(`Wrote priority language production-ready export to ${PRIORITY_OUTPUT_PATH}`);
        console.log(`Fully supported languages (production-ready): ${productionReadyLanguageSummary.length}`);
}

fetchAndWriteTranslations().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});