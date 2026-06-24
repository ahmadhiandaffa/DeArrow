import * as ort from "onnxruntime-web";

const NUM_FEATURES = 10;

let inferenceSession: ort.InferenceSession | null = null;
let modelLoaded = false;
let modelLoadFailed = false;

async function getSession(): Promise<ort.InferenceSession | null> {
    if (modelLoaded) return inferenceSession;
    if (modelLoadFailed) return null;

    try {
        const modelUrl = chrome.runtime.getURL("clickbait_model.onnx");
        inferenceSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ["wasm"],
        });
        modelLoaded = true;
        console.info("[DeArrow ML] Clickbait model loaded successfully.");
    } catch (e) {
        // Model file is empty or missing — fall back to random scores
        modelLoadFailed = true;
        console.warn("[DeArrow ML] Could not load clickbait model, using random scores:", e);
    }

    return inferenceSession;
}

void getSession();

function extractTitleFeatures(title: string): number[] {
    const words = title.trim().split(/\s+/);
    const upperChars = (title.match(/[A-Z]/g) ?? []).length;
    const letters = (title.match(/[a-zA-Z]/g) ?? []).length;
    const capitalizedWords = words.filter((w) => w.length > 0 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()).length;

    return [
        Math.min(title.length / 100, 1),               // 0: normalized length
        Math.min(words.length / 20, 1),                  // 1: word count
        letters > 0 ? upperChars / letters : 0,          // 2: uppercase ratio
        words.length > 0 ? capitalizedWords / words.length : 0, // 3: capitalized word ratio
        title.includes("?") ? 1 : 0,                    // 4: has question mark
        title.includes("!") ? 1 : 0,                    // 5: has exclamation mark
        title.includes("...") || title.includes("…") ? 1 : 0, // 6: has ellipsis
    ];
}

function extractThumbnailFeatures(thumbnailImg: HTMLImageElement | null): number[] {
    const fallback = [0, 0, 0];
    if (!thumbnailImg || !thumbnailImg.complete || thumbnailImg.naturalWidth === 0) {
        return fallback;
    }

    try {
        const canvas = document.createElement("canvas");
        const sampleSize = 64; // Downsample for performance
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) return fallback;

        ctx.drawImage(thumbnailImg, 0, 0, sampleSize, sampleSize);
        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

        let totalR = 0, totalG = 0, totalB = 0;
        const pixels = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
            totalR += data[i];
            totalG += data[i + 1];
            totalB += data[i + 2];
        }

        const avgR = totalR / pixels / 255;
        const avgG = totalG / pixels / 255;
        const avgB = totalB / pixels / 255;

        const brightness = (avgR + avgG + avgB) / 3;
        const redDominance = avgR / (brightness * 3 + 0.001);
        const max = Math.max(avgR, avgG, avgB);
        const min = Math.min(avgR, avgG, avgB);
        const saturation = max > 0 ? (max - min) / max : 0;

        return [brightness, redDominance, saturation];
    } catch {
        // Cross-origin canvas read blocked
        return fallback;
    }
}

export async function inferClickbaitScore(
    title: string,
    thumbnailImg: HTMLImageElement | null
): Promise<number> {
    const session = await getSession();

    if (!session) {
        return Math.floor(Math.random() * 101);
    }

    const titleFeats = extractTitleFeatures(title);
    const thumbFeats = extractThumbnailFeatures(thumbnailImg);
    const features = [...titleFeats, ...thumbFeats];

    while (features.length < NUM_FEATURES) features.push(0);

    const inputTensor = new ort.Tensor(
        "float32",
        Float32Array.from(features.slice(0, NUM_FEATURES)),
        [1, NUM_FEATURES]
    );


    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const results = await session.run({ [inputName]: inputTensor });
    const outputData = results[outputName].data as Float32Array;

    const rawScore = outputData[0] ?? 0;
    return Math.round(Math.max(0, Math.min(1, rawScore)) * 100);
}
