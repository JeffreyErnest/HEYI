/**
 * background.js — HEYI Background Service Worker
 *
 * Runs persistently as a Chrome extension service worker.
 * Responsibilities:
 *   1. Scrape the active tab when the popup requests it
 *   2. Watch for page loads and warn the user if the site is flagged
 */


// Scrape the current tab for referencing DB to see if this is flagged as AI often
async function scrapeCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id || tab.url.startsWith("chrome://")) { // Can't scrape chrome:// or empty tabs
            return { error: "Cannot scan system pages." };
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Targets only semantic content elements, we do this so the AI is not confused about company logos or other random non-important headers or words on the website
                const textNodes = Array.from(document.querySelectorAll("h1, p"));
                const cleanText = textNodes
                    .map((el) => el.innerText.trim())
                    .filter((text) => text.length > 60) // skip tiny strings (icons, labels)
                    .join("\n\n");

                // Scores images by visual area, discard tiny icons/logos (As for ecommerce websites, the products are the largest images)
                const validImages = Array.from(document.images)
                    .filter((img) => img.src && img.src.startsWith("http"))
                    .map((img) => ({ src: img.src, area: img.width * img.height }))
                    .filter((data) => data.area > 10000) // ignore < ~100×100
                    .sort((a, b) => b.area - a.area);    // largest first

                return {
                    url: window.location.href,
                    text: cleanText,
                    images: validImages.map((d) => d.src),
                    timestamp: new Date().toISOString(),
                };
            },
        });

        return results[0].result;
    } catch (error) {
        console.error("Scraping backend error:", error);
        return { error: error.message };
    }
}


// sends scraped web data and waits for response from server
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === "SCRAPE_PAGE") {
        console.log("Scraping request received...");
        scrapeCurrentTab().then((response) => {
            console.log("Scraping complete, sending response back.");
            sendResponse(response);
        });
        return true; // keep the message channel open for async response
    }
});



 // When any tab finishes loading, check the backend to see if that domain has been previously flagged for AI content. If so, fire a native Chrome notification to alert the user proactively.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only trigger when the page fully loads and is a real website
    if (changeInfo.status !== "complete" || !tab.url || !tab.url.startsWith("http")) return;
    fetch(`https://heyi-a7j1.onrender.com/api/site-warning?url=${encodeURIComponent(tab.url)}`)
        .then((res) => res.json())
        .then((data) => {
            if (data.warn) {
                chrome.notifications.create({
                    type: "basic",
                    iconUrl: "assets/heyi_logo.png",
                    title: "HEYI Alert",
                    message: `Heads up! ${data.domain} is heavily flagged for AI-generated content. Proceed with caution.`,
                    priority: 2,
                });
            }
        })
        .catch((err) => console.log("Warning check failed in background:", err));
});
