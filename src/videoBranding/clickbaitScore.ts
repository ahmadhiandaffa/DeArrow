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

        const title = originalTitleElement.textContent ?? "";

        const thumbnailImg = element.querySelector("img") as HTMLImageElement | null;

        score = await inferClickbaitScore(title, thumbnailImg);

        badge.setAttribute("data-score", score.toString());
        badge.innerText = `${score}%`;

        originalTitleElement.parentElement.appendChild(badge);
    } else {
        score = parseInt(badge.getAttribute("data-score") || "0", 10);
    }

    const threshold = Config.config!.clickbaitThreshold ?? 20;

    const remainingRange = 100 - threshold;
    const third = remainingRange / 3;

    if (score < threshold + third) {
        badge.style.backgroundColor = "#d32f2f"; // Red
    } else if (score < threshold + 2 * third) {
        badge.style.backgroundColor = "#f57c00"; // Orange
    } else {
        badge.style.backgroundColor = "#2e7d32"; // Green
    }

    const container = element.closest("ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer") as HTMLElement || element;

    if (!Config.config!.extensionEnabled) {
        badge.style.display = "none";

        if (brandingLocation !== BrandingLocation.Watch) {
            container.style.removeProperty("display");
        }
        return;
    }

    badge.style.removeProperty("display");

    if (brandingLocation !== BrandingLocation.Watch) {
        if (score < threshold) {
            container.style.setProperty("display", "none", "important");
        } else {
            container.style.removeProperty("display");
        }
    }
}
