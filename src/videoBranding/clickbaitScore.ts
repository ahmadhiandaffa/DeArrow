import { VideoID } from "../../maze-utils/src/video";
import { BrandingLocation } from "./videoBranding";
import { getOriginalTitleElement } from "../titles/titleRenderer";
import Config from "../config/config";



export async function addClickbaitScoreBadge(element: HTMLElement, videoID: VideoID, brandingLocation: BrandingLocation): Promise<void> {
    const originalTitleElement = getOriginalTitleElement(element, brandingLocation);
    if (!originalTitleElement || !originalTitleElement.parentElement) return;

    let badge = originalTitleElement.parentElement.querySelector(".cb-clickbait-score") as HTMLElement | null;
    let score = 0;

    if (!badge) {
        badge = document.createElement("span");
        badge.classList.add("cb-clickbait-score");
        badge.setAttribute("videoID", videoID);
        
        // Generate a random score from 0% to 100%
        score = Math.floor(Math.random() * 101);
        badge.setAttribute("data-score", score.toString());
        badge.innerText = `${score}%`;

        // Dynamic color thresholding based on THRESHOLD
        const THRESHOLD = Config.config!.clickbaitThreshold ?? 30;
        const remainingRange = 100 - THRESHOLD;
        const third = remainingRange / 3;

        if (score < THRESHOLD + third) {
            badge.style.backgroundColor = "#d32f2f"; // Red
        } else if (score < THRESHOLD + 2 * third) {
            badge.style.backgroundColor = "#f57c00"; // Orange
        } else {
            badge.style.backgroundColor = "#2e7d32"; // Green
        }

        originalTitleElement.parentElement.appendChild(badge);
    } else {
        score = parseInt(badge.getAttribute("data-score") || "0", 10);
    }

    if (!Config.config!.extensionEnabled) {
        badge.style.display = "none";
        
        // Unhide the video if the extension is disabled
        if (brandingLocation !== BrandingLocation.Watch) {
            element.style.removeProperty("display");
        }
        return;
    }

    badge.style.removeProperty("display");

    // Hide videos below threshold, but never on the watch page
    const THRESHOLD = Config.config!.clickbaitThreshold ?? 30;
    if (brandingLocation !== BrandingLocation.Watch) {
        if (score < THRESHOLD) {
            element.style.setProperty("display", "none", "important");
        } else {
            element.style.removeProperty("display");
        }
    }
}
