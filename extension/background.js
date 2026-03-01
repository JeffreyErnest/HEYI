// background.js

// 1. Initial Badge State
chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeText({ text: "OFF" });
});

// 2. The Scraper "Engine" (Moved from popup to here for reliability)
async function scrapeCurrentTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Safety check for chrome:// or empty URLs
        if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
            return { error: "Cannot scan system pages." };
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Better scraping: Get only useful content (Headers and Paragraphs)
                const textNodes = Array.from(document.querySelectorAll('h1, p'));

                // Extract text, filter out empty space or useless tiny strings, and join them.
                const cleanText = textNodes
                    .map(el => el.innerText.trim())
                    .filter(text => text.length > 60) // Require at least 60 characters (removes nav/headers/footers)
                    .join('\n\n');

                return {
                    url: window.location.href,
                    text: cleanText,
                    images: Array.from(document.images).map(img => img.src).filter(src => src && src.startsWith('http')),
                    timestamp: new Date().toISOString()
                };
            }
        });

        return results[0].result;
    } catch (error) {
        console.error("Scraping backend error:", error);
        return { error: error.message };
    }
}

// 3. Listen for requests from the popup (heyi.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SCRAPE_PAGE") {
        console.log("Scraping request received...");
        scrapeCurrentTab().then(response => {
            console.log("Scraping complete, sending response back.");
            sendResponse(response);
        });
        return true; // Keep channel open for async scrape
    }
});
