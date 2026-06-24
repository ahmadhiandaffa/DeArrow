import { VideoID } from "../../maze-utils/src/video";
import { BrandingLocation } from "./videoBranding";
import { getOriginalTitleElement } from "../titles/titleRenderer";
import Config from "../config/config";
import { inferClickbaitScore } from "./clickbaitInference";

export async function addClickbaitScoreBadge(element: HTMLElement, videoID: VideoID, brandingLocation: BrandingLocation): Promise<void> {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    if (!originalTitleElement || !originalTitleElement.parentElement) return;

    let badge = originalTitleElement.parentElement.querySelector(".cb-clickbait-score") as HTMLElement | null;
    let score = 0;

    if (!badge) {
        badge = document.createElement("span");
        badge.classList.add("cb-clickbait-score");
        badge.setAttribute("videoID", videoID);

        // Get the title text for inference
        const title = originalTitleElement.textContent ?? "";

        // Get the thumbnail image element for inference (may be null)
        const thumbnailImg = element.querySelector("img") as HTMLImageElement | null;

        // Run inference (falls back to random if model is not yet provided)
        score = await inferClickbaitScore(title, thumbnailImg);

        badge.setAttribute("data-score", score.toString());
        badge.innerText = `${score}%`;

        originalTitleElement.parentElement.appendChild(badge);
    } else {
        score = parseInt(badge.getAttribute("data-score") || "0", 10);
    }

    // Declare threshold once — used for both color and visibility
    const threshold = Config.config!.clickbaitThreshold ?? 30;

    // Always recalculate color based on the current threshold
    const remainingRange = 100 - threshold;
    const third = remainingRange / 3;

    if (score < threshold + third) {
        badge.style.backgroundColor = "#d32f2f"; // Red
    } else if (score < threshold + 2 * third) {
        badge.style.backgroundColor = "#f57c00"; // Orange
    } else {
        badge.style.backgroundColor = "#2e7d32"; // Green
    }

    // Find the actual grid container so we don't leave empty rectangles in the layout
    const container = element.closest("ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer") as HTMLElement || element;

    if (!Config.config!.extensionEnabled) {
        badge.style.display = "none";

        // Unhide the video if the extension is disabled
        if (brandingLocation !== BrandingLocation.Watch) {
            container.style.removeProperty("display");
        }
        return;
    }

    badge.style.removeProperty("display");

    // Hide videos below threshold, but never on the watch page
    if (brandingLocation !== BrandingLocation.Watch) {
        if (score < threshold) {
            container.style.setProperty("display", "none", "important");
        } else {
            container.style.removeProperty("display");
        }
    }
}
