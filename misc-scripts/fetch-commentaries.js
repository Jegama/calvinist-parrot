const fs = require('node:fs/promises');
const path = require('node:path');

const API_URL = 'https://bible.helloao.org/api/available_commentaries.json';
const DATA_DIR = path.join(process.cwd(), 'content', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'available-commentaries-summary.json');
const PRODUCTION_READY_OUTPUT_PATH = path.join(DATA_DIR, 'available-commentaries-production-ready.json');

function normalizeCommentary(commentary) {
    return {
        id: commentary.id,
        name: commentary.name,
        englishName: commentary.englishName,
        website: commentary.website ?? null,
        licenseUrl: commentary.licenseUrl,
        licenseNotes: commentary.licenseNotes ?? null,
        licenseNotice: commentary.licenseNotice ?? null,
        language: commentary.language,
        languageName: commentary.languageName ?? null,
        languageEnglishName: commentary.languageEnglishName ?? null,
        textDirection: commentary.textDirection,
        sha256: commentary.sha256 ?? null,
        availableFormats: Array.isArray(commentary.availableFormats) ? commentary.availableFormats : [],
        listOfBooksApiLink: commentary.listOfBooksApiLink ?? null,
        listOfProfilesApiLink: commentary.listOfProfilesApiLink ?? null,
        numberOfBooks: commentary.numberOfBooks,
        totalNumberOfChapters: commentary.totalNumberOfChapters,
        totalNumberOfVerses: commentary.totalNumberOfVerses,
        totalNumberOfProfiles: commentary.totalNumberOfProfiles,
    };
}

function buildLanguageSummary(items) {
    const languageMap = new Map();

    for (const item of items) {
        const key = item.language || 'unknown';
        const existing = languageMap.get(key) ?? {
            language: key,
            languageName: item.languageName,
            languageEnglishName: item.languageEnglishName,
            textDirection: item.textDirection,
            itemCount: 0,
        };

        existing.itemCount += 1;

        if (!existing.languageName && item.languageName) {
            existing.languageName = item.languageName;
        }
        if (!existing.languageEnglishName && item.languageEnglishName) {
            existing.languageEnglishName = item.languageEnglishName;
        }

        languageMap.set(key, existing);
    }

    return Array.from(languageMap.values()).sort((a, b) => {
        if (b.itemCount !== a.itemCount) {
            return b.itemCount - a.itemCount;
        }
        return String(a.language).localeCompare(String(b.language));
    });
}

function byNameSort(a, b) {
    return a.name.localeCompare(b.name);
}

function isPositiveNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isProductionReady(commentary) {
    const formats = Array.isArray(commentary.availableFormats) ? commentary.availableFormats : [];

    return (
        typeof commentary.id === 'string' && commentary.id.length > 0 &&
        typeof commentary.name === 'string' && commentary.name.length > 0 &&
        typeof commentary.englishName === 'string' && commentary.englishName.length > 0 &&
        typeof commentary.licenseUrl === 'string' && commentary.licenseUrl.length > 0 &&
        typeof commentary.language === 'string' && commentary.language.length > 0 &&
        (commentary.textDirection === 'ltr' || commentary.textDirection === 'rtl') &&
        typeof commentary.listOfBooksApiLink === 'string' && commentary.listOfBooksApiLink.length > 0 &&
        isPositiveNumber(commentary.numberOfBooks) &&
        isPositiveNumber(commentary.totalNumberOfChapters) &&
        isPositiveNumber(commentary.totalNumberOfVerses) &&
        isNonNegativeNumber(commentary.totalNumberOfProfiles) &&
        formats.includes('json')
    );
}

function getMissingProductionCriteria(commentary) {
    const formats = Array.isArray(commentary.availableFormats) ? commentary.availableFormats : [];
    const missing = [];

    if (!(typeof commentary.id === 'string' && commentary.id.length > 0)) missing.push('id');
    if (!(typeof commentary.name === 'string' && commentary.name.length > 0)) missing.push('name');
    if (!(typeof commentary.englishName === 'string' && commentary.englishName.length > 0)) missing.push('englishName');
    if (!(typeof commentary.licenseUrl === 'string' && commentary.licenseUrl.length > 0)) missing.push('licenseUrl');
    if (!(typeof commentary.language === 'string' && commentary.language.length > 0)) missing.push('language');
    if (!(commentary.textDirection === 'ltr' || commentary.textDirection === 'rtl')) missing.push('textDirection');
    if (!(typeof commentary.listOfBooksApiLink === 'string' && commentary.listOfBooksApiLink.length > 0)) missing.push('listOfBooksApiLink');
    if (!isPositiveNumber(commentary.numberOfBooks)) missing.push('numberOfBooks');
    if (!isPositiveNumber(commentary.totalNumberOfChapters)) missing.push('totalNumberOfChapters');
    if (!isPositiveNumber(commentary.totalNumberOfVerses)) missing.push('totalNumberOfVerses');
    if (!isNonNegativeNumber(commentary.totalNumberOfProfiles)) missing.push('totalNumberOfProfiles');
    if (!formats.includes('json')) missing.push('jsonFormat');

    return missing;
}

async function fetchAndWriteCommentaries() {
    const response = await fetch(API_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch commentaries: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const commentaries = Array.isArray(payload?.commentaries) ? payload.commentaries : [];

    const commentarySummary = commentaries.map(normalizeCommentary).sort(byNameSort);
    const languageSummary = buildLanguageSummary(commentarySummary);

    const productionReadyCommentaries = commentarySummary.filter(isProductionReady).sort(byNameSort);
    const productionReadyLanguageSummary = buildLanguageSummary(productionReadyCommentaries);

    const output = {
        generatedAt: new Date().toISOString(),
        source: API_URL,
        totals: {
            commentaries: commentarySummary.length,
            languages: languageSummary.length,
            commentariesWithProfiles: commentarySummary.filter((commentary) => commentary.totalNumberOfProfiles > 0).length,
        },
        languageSummary,
        commentaries: commentarySummary,
    };

    const productionReadyOutput = {
        generatedAt: new Date().toISOString(),
        source: API_URL,
        productionCriteria: {
            requiredFields: ['id', 'name', 'englishName', 'licenseUrl', 'language', 'textDirection', 'listOfBooksApiLink'],
            requiredFormat: 'json',
            numericFieldsMustBePositive: ['numberOfBooks', 'totalNumberOfChapters', 'totalNumberOfVerses'],
            numericFieldsMustBeNonNegative: ['totalNumberOfProfiles'],
        },
        totals: {
            productionReadyCommentaries: productionReadyCommentaries.length,
            fullySupportedLanguages: productionReadyLanguageSummary.length,
        },
        languageSummary: productionReadyLanguageSummary,
        commentaries: productionReadyCommentaries.map((commentary) => ({
            ...commentary,
            missingProductionCriteria: getMissingProductionCriteria(commentary),
        })),
    };

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    await fs.writeFile(PRODUCTION_READY_OUTPUT_PATH, `${JSON.stringify(productionReadyOutput, null, 2)}\n`, 'utf8');

    console.log(`Wrote full summary to ${OUTPUT_PATH}`);
    console.log(`Wrote production-ready summary to ${PRODUCTION_READY_OUTPUT_PATH}`);
    console.log(`Fully supported languages (production-ready): ${productionReadyLanguageSummary.length}`);
}

fetchAndWriteCommentaries().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
