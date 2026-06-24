import * as ort from "onnxruntime-web";

/**
 * Feature vector layout (total: 10 features):
 *
 * Title features [0..6]:
 *   0 - normalized title length (chars / 100)
 *   1 - word count (/ 20)
 *   2 - uppercase ratio (0.0 - 1.0)
 *   3 - capitalized word ratio (0.0 - 1.0)
 *   4 - has question mark (0 or 1)
 *   5 - has exclamation mark (0 or 1)
 *   6 - has ellipsis (0 or 1)
 *
 * Thumbnail features [7..9]:
 *   7 - mean brightness (0.0 - 1.0)
 *   8 - red channel dominance (0.0 - 1.0)
 *   9 - saturation estimate (0.0 - 1.0)
 *
 * Output:
 *   A single float32 in [0, 1] where 0 = not clickbait, 1 = very clickbait.
 *   This is multiplied by 100 to produce the integer score shown in the badge.
 *
 * TODO: Replace with your trained model. The expected input shape is [1, 10] float32.
 */

const NUM_FEATURES = 10;

let inferenceSession: ort.InferenceSession | null = null;
let modelLoaded = false;
let modelLoadFailed = false;

/**
 * Lazily loads the ONNX model on first inference call.
 * Falls back gracefully if the file is missing or invalid.
 */
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

// Pre-warm the session when the content script loads
void getSession();

// ─── Feature Extraction ────────────────────────────────────────────────────

/**
 * Extracts a fixed-length float32 feature vector from the video title.
 */
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

/**
 * Samples the thumbnail image element and returns pixel-level statistics.
 * Returns zeros if the image is not yet loaded or cross-origin restricted.
 */
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

// ─── Main Inference API ────────────────────────────────────────────────────

/**
 * Runs inference on the given title and (optionally) thumbnail image.
 * Returns a score from 0 (not clickbait) to 100 (very clickbait).
 *
 * Falls back to a random score if the model has not yet been replaced.
 */
export async function inferClickbaitScore(
    title: string,
    thumbnailImg: HTMLImageElement | null
): Promise<number> {
    const session = await getSession();

    if (!session) {
        // Model not loaded — use random placeholder until real model is provided
        return Math.floor(Math.random() * 101);
    }

    const titleFeats = extractTitleFeatures(title);
    const thumbFeats = extractThumbnailFeatures(thumbnailImg);
    const features = [...titleFeats, ...thumbFeats];

    // Ensure we always send exactly NUM_FEATURES values
    while (features.length < NUM_FEATURES) features.push(0);

    const inputTensor = new ort.Tensor(
        "float32",
        Float32Array.from(features.slice(0, NUM_FEATURES)),
        [1, NUM_FEATURES]
    );

    // TODO: Update input/output names to match your model's actual node names.
    // Inspect with Netron (https://netron.app) or print session.inputNames.
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const results = await session.run({ [inputName]: inputTensor });
    const outputData = results[outputName].data as Float32Array;

    // Expecting a single probability in [0, 1]; multiply to get 0-100 score
    const rawScore = outputData[0] ?? 0;
    return Math.round(Math.max(0, Math.min(1, rawScore)) * 100);
}
