// background.js

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

                // Better Image Scraping: Find the largest image on the page (skip logos/icons)
                const validImages = Array.from(document.images)
                    .filter(img => img.src && img.src.startsWith('http')) // Must be a real web URL
                    .map(img => {
                        return {
                            src: img.src,
                            area: img.width * img.height // Calculate visual footprint
                        };
                    })
                    .filter(imgData => imgData.area > 10000) // Ignore tiny logos/icons (e.g. 100x100 logo = 10k area)
                    .sort((a, b) => b.area - a.area); // Sort largest to smallest

                // Extract just the sorted URLs
                const sortedImageUrls = validImages.map(imgData => imgData.src);

                return {
                    url: window.location.href,
                    text: cleanText,
                    images: sortedImageUrls,
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only run when the page fully loads and is a real website
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        
        // Ask your database if this site is sketchy
        fetch(`http://localhost:3000/api/site-warning?url=${encodeURIComponent(tab.url)}`)
            .then(response => response.json())
            .then(data => {
                if (data.warn) {
                    // Fire a native Chrome notification!
                    chrome.notifications.create({
                        type: "basic",
                        iconUrl: "assets/heyi_logo.png",
                        title: "HEYI Alert",
                        message: `Heads up! ${data.domain} is heavily flagged for AI-generated content. Proceed with caution.`,
                        priority: 2
                    });
                }
            })
            .catch(err => console.log("Warning check failed in background:", err));
    }
});
