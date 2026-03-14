const fs = require('node:fs/promises');
const path = require('node:path');

const API_URL = 'https://bible.helloao.org/api/available_datasets.json';
const DATA_DIR = path.join(process.cwd(), 'content', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'available-datasets-summary.json');
const PRODUCTION_READY_OUTPUT_PATH = path.join(DATA_DIR, 'available-datasets-production-ready.json');

function normalizeDataset(dataset) {
    return {
        id: dataset.id,
        name: dataset.name,
        englishName: dataset.englishName,
        website: dataset.website ?? null,
        licenseUrl: dataset.licenseUrl,
        licenseNotes: dataset.licenseNotes ?? null,
        language: dataset.language,
        languageName: dataset.languageName ?? null,
        languageEnglishName: dataset.languageEnglishName ?? null,
        textDirection: dataset.textDirection,
        sha256: dataset.sha256 ?? null,
        availableFormats: Array.isArray(dataset.availableFormats) ? dataset.availableFormats : [],
        listOfBooksApiLink: dataset.listOfBooksApiLink ?? null,
        numberOfBooks: dataset.numberOfBooks,
        totalNumberOfChapters: dataset.totalNumberOfChapters,
        totalNumberOfVerses: dataset.totalNumberOfVerses,
        totalNumberOfReferences: dataset.totalNumberOfReferences,
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

function isProductionReady(dataset) {
    const formats = Array.isArray(dataset.availableFormats) ? dataset.availableFormats : [];

    return (
        typeof dataset.id === 'string' && dataset.id.length > 0 &&
        typeof dataset.name === 'string' && dataset.name.length > 0 &&
        typeof dataset.englishName === 'string' && dataset.englishName.length > 0 &&
        typeof dataset.licenseUrl === 'string' && dataset.licenseUrl.length > 0 &&
        typeof dataset.language === 'string' && dataset.language.length > 0 &&
        (dataset.textDirection === 'ltr' || dataset.textDirection === 'rtl') &&
        typeof dataset.listOfBooksApiLink === 'string' && dataset.listOfBooksApiLink.length > 0 &&
        isPositiveNumber(dataset.numberOfBooks) &&
        isPositiveNumber(dataset.totalNumberOfChapters) &&
        isPositiveNumber(dataset.totalNumberOfVerses) &&
        isPositiveNumber(dataset.totalNumberOfReferences) &&
        formats.includes('json')
    );
}

function getMissingProductionCriteria(dataset) {
    const formats = Array.isArray(dataset.availableFormats) ? dataset.availableFormats : [];
    const missing = [];

    if (!(typeof dataset.id === 'string' && dataset.id.length > 0)) missing.push('id');
    if (!(typeof dataset.name === 'string' && dataset.name.length > 0)) missing.push('name');
    if (!(typeof dataset.englishName === 'string' && dataset.englishName.length > 0)) missing.push('englishName');
    if (!(typeof dataset.licenseUrl === 'string' && dataset.licenseUrl.length > 0)) missing.push('licenseUrl');
    if (!(typeof dataset.language === 'string' && dataset.language.length > 0)) missing.push('language');
    if (!(dataset.textDirection === 'ltr' || dataset.textDirection === 'rtl')) missing.push('textDirection');
    if (!(typeof dataset.listOfBooksApiLink === 'string' && dataset.listOfBooksApiLink.length > 0)) missing.push('listOfBooksApiLink');
    if (!isPositiveNumber(dataset.numberOfBooks)) missing.push('numberOfBooks');
    if (!isPositiveNumber(dataset.totalNumberOfChapters)) missing.push('totalNumberOfChapters');
    if (!isPositiveNumber(dataset.totalNumberOfVerses)) missing.push('totalNumberOfVerses');
    if (!isPositiveNumber(dataset.totalNumberOfReferences)) missing.push('totalNumberOfReferences');
    if (!formats.includes('json')) missing.push('jsonFormat');

    return missing;
}

async function fetchAndWriteDatasets() {
    const response = await fetch(API_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const datasets = Array.isArray(payload?.datasets) ? payload.datasets : [];

    const datasetSummary = datasets.map(normalizeDataset).sort(byNameSort);
    const languageSummary = buildLanguageSummary(datasetSummary);

    const productionReadyDatasets = datasetSummary.filter(isProductionReady).sort(byNameSort);
    const productionReadyLanguageSummary = buildLanguageSummary(productionReadyDatasets);

    const output = {
        generatedAt: new Date().toISOString(),
        source: API_URL,
        totals: {
            datasets: datasetSummary.length,
            languages: languageSummary.length,
            totalReferences: datasetSummary.reduce((sum, dataset) => sum + (dataset.totalNumberOfReferences ?? 0), 0),
        },
        languageSummary,
        datasets: datasetSummary,
    };

    const productionReadyOutput = {
        generatedAt: new Date().toISOString(),
        source: API_URL,
        productionCriteria: {
            requiredFields: ['id', 'name', 'englishName', 'licenseUrl', 'language', 'textDirection', 'listOfBooksApiLink'],
            requiredFormat: 'json',
            numericFieldsMustBePositive: ['numberOfBooks', 'totalNumberOfChapters', 'totalNumberOfVerses', 'totalNumberOfReferences'],
        },
        totals: {
            productionReadyDatasets: productionReadyDatasets.length,
            fullySupportedLanguages: productionReadyLanguageSummary.length,
        },
        languageSummary: productionReadyLanguageSummary,
        datasets: productionReadyDatasets.map((dataset) => ({
            ...dataset,
            missingProductionCriteria: getMissingProductionCriteria(dataset),
        })),
    };

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    await fs.writeFile(PRODUCTION_READY_OUTPUT_PATH, `${JSON.stringify(productionReadyOutput, null, 2)}\n`, 'utf8');

    console.log(`Wrote full summary to ${OUTPUT_PATH}`);
    console.log(`Wrote production-ready summary to ${PRODUCTION_READY_OUTPUT_PATH}`);
    console.log(`Fully supported languages (production-ready): ${productionReadyLanguageSummary.length}`);
}

fetchAndWriteDatasets().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
