/**
 * heyi.js — HEYI Chrome Extension Popup Controller
 * 
 * Orchestrates the scan → result flow for the HEYI AI detection extension.
 * Communicates with the background script for page scraping, sends data to
 * Hugging Face (text) and Gemini (image) APIs, then displays a blended
 * confidence score with animated ring and tooltip breakdown.
 */

document.addEventListener("DOMContentLoaded", () => {
    console.log("HEYI VERSION 4.0 — MODULAR REFACTOR");

    /* ═══════════════════════════════════════════════════════════════════
     *  1. DOM ELEMENT REFERENCES
     * ═══════════════════════════════════════════════════════════════════ */

    const dom = initDOMElements();
    const ring = initProgressRing(dom.arcPath);

    /* ═══════════════════════════════════════════════════════════════════
     *  2. CONSTANTS
     * ═══════════════════════════════════════════════════════════════════ */

    /** Gradio Space endpoint for the AI text classifier */
    const GRADIO_API_URL = "https://toothsocket-heyi-detector.hf.space/gradio_api/call/analyze_text";

    /** Local backend endpoint for Gemini image verification */
    const IMAGE_API_URL = "http://localhost:3000/api/verify-image";

    /** SVG markup for the "danger" result icon (red warning triangle) */
    const ICON_DANGER = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#c1121f" viewBox="0 0 256 256"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"></path></svg>`;

    /** SVG markup for the "safe" result icon (green checkmark circle) */
    const ICON_SAFE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#2ecc71" viewBox="0 0 256 256"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path></svg>`;

    /* ═══════════════════════════════════════════════════════════════════
     *  3. EVENT LISTENERS
     * ═══════════════════════════════════════════════════════════════════ */

    dom.scanBtn.addEventListener("click", handleScanClick);
    dom.scanAgainBtn.addEventListener("click", handleScanAgainClick);
    dom.closeBtn.addEventListener("click", () => window.close());

    /* ═══════════════════════════════════════════════════════════════════
     *  4. ON LOAD — Restore previous result if one exists
     * ═══════════════════════════════════════════════════════════════════ */

    loadResultFromStorage();


    /* ═══════════════════════════════════════════════════════════════════════
     *  INITIALIZATION HELPERS
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Cache all DOM element references into a single object.
     * Keeps the top-level scope clean and makes dependencies explicit.
     * @returns {Object} Map of named DOM element references
     */
    function initDOMElements() {
        const scanBtn = document.getElementById("scan-btn");

        return {
            // Buttons
            scanBtn,
            scanBtnText: scanBtn.querySelector(".btn-text"),
            btnLoader: scanBtn.querySelector(".btn-loader"),
            scanAgainBtn: document.getElementById("scan-again-btn"),
            closeBtn: document.getElementById("close-btn"),

            // Views
            viewScan: document.getElementById("view-scan"),
            viewResult: document.getElementById("view-result"),

            // Result display
            confidenceValueEl: document.getElementById("confidence-value"),
            resultTitleEl: document.getElementById("result-title"),
            resultSubtitleEl: document.getElementById("result-subtitle"),
            resultDescriptionEl: document.getElementById("result-description"),
            resultIconEl: document.getElementById("result-icon"),

            // Info tooltip
            infoTooltipText: document.getElementById("info-tooltip-text"),

            // SVG ring
            arcPath: document.getElementById("mask-path"),
        };
    }

    /**
     * Calculate the total arc length of the SVG path and set the initial
     * stroke-dasharray to "0 <total>" so the ring starts empty.
     * @param {SVGPathElement} arcPath - The SVG <path> used as the progress arc
     * @returns {Object} Ring configuration with `maxDash` length
     */
    function initProgressRing(arcPath) {
        const maxDash = arcPath.getTotalLength();
        arcPath.style.strokeDasharray = `0 ${maxDash}`;
        arcPath.style.strokeDashoffset = 0;
        return { maxDash };
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  PROGRESS RING ANIMATION
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Set the SVG ring fill to a given percentage (0–100).
     * Works by adjusting stroke-dasharray so that `percent`% of the arc is visible.
     * @param {number} percent - Value from 0 to 100
     */
    function setProgress(percent) {
        const visibleLength = (percent / 100) * ring.maxDash;
        dom.arcPath.style.strokeDasharray = `${visibleLength} ${ring.maxDash}`;
    }

    /**
     * Smoothly animate a numeric counter from `start` to `end` over `duration` ms.
     * Uses an ease-out curve for a natural deceleration feel.
     * @param {HTMLElement} el       - Element whose innerHTML will be updated
     * @param {number}      start    - Starting value
     * @param {number}      end      - Ending value
     * @param {number}      duration - Animation length in milliseconds
     */
    function animateValue(el, start, end, duration) {
        let startTimestamp = null;

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = progress * (2 - progress); // ease-out quadratic
            el.innerHTML = Math.floor(easeProgress * (end - start) + start) + "%";
            if (progress < 1) window.requestAnimationFrame(step);
        };

        window.requestAnimationFrame(step);
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  PAGE SCRAPING (via Background Script)
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Ask the background service worker to scrape the active tab's content.
     * Returns an object with { url, text, images[], timestamp } on success,
     * or { error } on failure.
     * @returns {Promise<Object>} Scraped page data
     */
    async function getPageDetails() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "SCRAPE_PAGE" }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  AI ANALYSIS — TEXT (Hugging Face Gradio Space)
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Send scraped text to the Hugging Face Gradio Space for AI detection.
     * Uses a two-step flow:
     *   1. POST text to get an event_id from the prediction queue
     *   2. Listen via Server-Sent Events (SSE) for the "complete" event
     *
     * @param {string} text - The scraped page text
     * @returns {Promise<number>} AI confidence percentage (0–100), or -1 on error
     */
    async function analyzeText(text) {
        try {
            console.log("Sending text to HuggingFace Gradio Space...");

            // Truncate to 10k chars to prevent payload bloat —
            // the model truncates everything past 512 tokens anyway
            const cleanText = text.length > 10000 ? text.substring(0, 10000) : text;

            const response = await fetch(GRADIO_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: [cleanText] })
            });

            if (!response.ok) {
                console.error("HTTP error when requesting event_id:", response.status);
                return -1;
            }

            const { event_id } = await response.json();
            if (!event_id) {
                console.error("Missing event_id in Gradio response.");
                return -1;
            }

            console.log("Got Event ID:", event_id);

            // Listen for result via SSE
            return new Promise((resolve) => {
                const es = new EventSource(`${GRADIO_API_URL}/${event_id}`);

                es.addEventListener("complete", (event) => {
                    es.close();
                    try {
                        const resultData = JSON.parse(event.data);
                        console.log("Gradio complete data:", resultData);

                        if (resultData?.[0]?.aiPercentage !== undefined) {
                            resolve(parseFloat(resultData[0].aiPercentage));
                        } else {
                            console.warn("Unexpected result format:", resultData);
                            resolve(0);
                        }
                    } catch (e) {
                        console.error("Could not parse event payload:", e);
                        resolve(0);
                    }
                });

                es.addEventListener("error", (err) => {
                    es.close();
                    console.error("EventSource error:", err);
                    resolve(-1);
                });
            });

        } catch (error) {
            console.error("Backend connection error:", error);
            return -1;
        }
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  AI ANALYSIS — IMAGE (Gemini via Local Backend)
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Send the most prominent image URL to the local Gemini backend for
     * AI-generated image detection.
     *
     * @param {string|null} imageUrl - URL of the image to analyze
     * @returns {Promise<{score: number, reasoning: string}>}
     *          score is 0–100 (or -1 on error), reasoning is Gemini's explanation
     */
    async function analyzeImage(imageUrl) {
        if (!imageUrl) return { score: 0, reasoning: "" };

        try {
            console.log("Sending image to Gemini Backend API...");

            const response = await fetch(IMAGE_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrl })
            });

            if (!response.ok) {
                console.error("HTTP error when verifying image:", response.status);
                return { score: -1, reasoning: "Failed to verify image due to a server error." };
            }

            const data = await response.json();
            console.log("Gemini Image Verification Result:", data);

            return {
                score: data.aiPercentage || 0,
                reasoning: data.reasoning || "No reasoning provided."
            };

        } catch (error) {
            console.error("Image verification connection error:", error);
            return { score: -1, reasoning: "Failed to connect to the image analysis server." };
        }
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  SCORE CALCULATION
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Compute the final blended confidence score from text and image analysis.
     * If both text and image were evaluated, averages them.
     * Returns -1 if either backend was unreachable.
     *
     * @param {number}  textScore   - Text AI confidence (0–100 or -1)
     * @param {Object}  imageResult - { score, reasoning }
     * @param {boolean} hasImage    - Whether the page had an image to analyze
     * @returns {number} Final blended confidence (0–100), or -1 on error
     */
    function calculateBlendedScore(textScore, imageResult, hasImage) {
        const imageScore = imageResult.score;

        // If either backend failed, signal an error
        if (textScore === -1 || imageScore === -1) return -1;

        if (hasImage) {
            const blended = (textScore + imageScore) / 2;
            console.log(`Blended Score: (Text: ${textScore}% + Image: ${imageScore}%) / 2 = ${blended}%`);
            return blended;
        }

        // Text-only (no images found on the page)
        console.log(`Text-Only Score: ${textScore}%`);
        return textScore;
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  UI RENDERING
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Populate the result view's title, subtitle, description, and icon
     * based on the final confidence score.
     *
     * @param {number} confidence  - Blended confidence (0–100 or -1)
     * @param {Object} imageResult - { score, reasoning } from Gemini
     */
    function buildResultUI(confidence, imageResult) {
        if (confidence === -1) {
            dom.resultTitleEl.textContent = "Oops!";
            dom.resultSubtitleEl.textContent = "Could not reach the analysis server.";
            dom.resultDescriptionEl.textContent = "Make sure the backend server is running on localhost:3000. Start it with: node server.js";
            dom.resultIconEl.innerHTML = ICON_DANGER;
            return;
        }

        if (confidence >= 50) {
            // AI detected
            dom.resultTitleEl.textContent = "Careful!";
            dom.resultSubtitleEl.textContent = `We are ${Math.round(confidence)}% sure this is AI.`;
            dom.resultDescriptionEl.innerHTML = "This page exhibits patterns commonly found in AI-generated text. Proceed with caution when buying or evaluating.";
            dom.resultIconEl.innerHTML = ICON_DANGER;
        } else {
            // Human content
            dom.resultTitleEl.textContent = "All good!";
            dom.resultSubtitleEl.textContent = "Human-written content detected.";
            dom.resultDescriptionEl.innerHTML = "The content on this page appears to be human-written and organic. Happy browsing!";
            dom.resultIconEl.innerHTML = ICON_SAFE;
        }
    }

    /**
     * Populate the info tooltip with per-signal breakdown and Gemini reasoning.
     *
     * @param {number} textScore   - Text AI confidence (0–100)
     * @param {number} imageScore  - Image AI confidence (0–100)
     * @param {string} reasoning   - Gemini's reasoning string
     */
    function updateInfoTooltip(textScore, imageScore, reasoning) {
        const textPart = `Text = ${Math.round(textScore)}%`;
        const imagePart = `Image = ${Math.round(imageScore)}%`;
        const reasonPart = reasoning || "No image analyzed.";
        dom.infoTooltipText.innerHTML = `<strong>${textPart} | ${imagePart}</strong><br>${reasonPart}`;
    }

    /**
     * Transition from the scan view to the result view with a fade/slide animation,
     * then animate the confidence ring filling to the target percentage.
     *
     * @param {number} confidence - The final score to display (0–100)
     */
    function showResultView(confidence) {
        // Fade out scan view
        dom.viewScan.classList.remove("active");

        setTimeout(() => {
            dom.viewScan.classList.add("hidden");
            dom.viewResult.classList.remove("hidden");

            requestAnimationFrame(() => {
                dom.viewResult.classList.add("active");

                // Animate the ring after a short delay for visual polish
                setTimeout(() => {
                    setProgress(confidence);
                    animateValue(dom.confidenceValueEl, 0, confidence, 1500);
                }, 300);
            });
        }, 400);
    }

    /**
     * Transition from the result view back to the scan view.
     * Resets the ring, counter, and button state so the user can scan again.
     */
    function resetToScanView() {
        dom.viewResult.classList.remove("active");

        setTimeout(() => {
            dom.viewResult.classList.add("hidden");
            dom.viewScan.classList.remove("hidden");

            // Reset ring and counter to zero
            setProgress(0);
            dom.confidenceValueEl.innerHTML = "0%";

            // Reset scan button to its resting state
            dom.scanBtnText.textContent = "Scan Page";
            dom.scanBtnText.style.opacity = "1";
            dom.btnLoader.classList.add("hidden");
            dom.scanBtn.classList.add("pulse-glow");

            requestAnimationFrame(() => {
                dom.viewScan.classList.add("active");
            });
        }, 400);
    }

    /**
     * Set the scan button into a loading state (hide text, show spinner).
     */
    function showScanLoading() {
        dom.scanBtnText.style.opacity = "0";
        dom.btnLoader.classList.remove("hidden");
        dom.scanBtn.classList.remove("pulse-glow");
    }

    /**
     * Set the scan button into an error state (show "Error" text).
     */
    function showScanError() {
        dom.scanBtnText.textContent = "Error";
        dom.scanBtnText.style.opacity = "1";
        dom.btnLoader.classList.add("hidden");
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  PERSISTENCE — chrome.storage.local
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Save a completed scan result to chrome.storage.local so the popup
     * can restore it if closed and reopened before the user hits "Scan Again".
     *
     * @param {Object} data - Result payload to persist
     * @param {number} data.confidence    - Blended confidence score
     * @param {number} data.textScore     - Text-only score
     * @param {number} data.imageScore    - Image-only score
     * @param {string} data.reasoning     - Gemini reasoning text
     * @param {string} data.url           - The URL that was scanned
     */
    function saveResultToStorage(data) {
        chrome.storage.local.set({ heyiLastResult: data }, () => {
            console.log("💾 Scan result saved to storage.");
        });
    }

    /**
     * On popup open, check if there is a stored result for the current tab.
     * If found, skip the scan view and immediately show the result.
     */
    async function loadResultFromStorage() {
        // First, find out what URL the active tab is on
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        chrome.storage.local.get("heyiLastResult", (stored) => {
            const result = stored.heyiLastResult;

            // Only restore if we have a result AND it matches the current tab
            if (!result || result.url !== tab.url) return;

            console.log("♻️ Restoring saved result for", result.url);

            const confidence = result.confidence;

            // Rebuild the UI from saved data
            buildResultUI(confidence, { score: result.imageScore, reasoning: result.reasoning });
            updateInfoTooltip(result.textScore, result.imageScore, result.reasoning);

            // Swap views instantly (no animation on restore)
            dom.viewScan.classList.remove("active");
            dom.viewScan.classList.add("hidden");
            dom.viewResult.classList.remove("hidden");

            requestAnimationFrame(() => {
                dom.viewResult.classList.add("active");

                setTimeout(() => {
                    setProgress(confidence);
                    animateValue(dom.confidenceValueEl, 0, confidence, 1500);
                }, 300);
            });
        });
    }

    /**
     * Remove the stored result so the next popup open starts fresh.
     */
    function clearStoredResult() {
        chrome.storage.local.remove("heyiLastResult", () => {
            console.log("🗑️ Stored result cleared.");
        });
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  DATABASE PERSISTENCE
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Save a scan result to the MongoDB backend for long-term analytics.
     * Sends to either /api/scan-text or /api/scan-image depending on type.
     *
     * @param {Object} pageData - Scraped page data (url, text, images)
     * @param {number} aiScore  - AI confidence percentage (0–100)
     * @param {string} type     - Either "text" or "image"
     */
    async function saveResultsToDB(pageData, aiScore, type) {
        const endpoint = type === "image"
            ? "http://localhost:3000/api/scan-image"
            : "http://localhost:3000/api/scan-text";

        // Server expects aiScore as a decimal (0.85), so divide by 100
        const payload = type === "image" ? {
            imageHash: pageData.images[0],
            aiScore: aiScore / 100,
            metadataFound: false
        } : {
            url: pageData.url,
            textHash: pageData.text.substring(0, 50),
            aiScore: aiScore / 100
        };

        try {
            await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            console.log(`✅ ${type} scan saved to MongoDB!`);
        } catch (err) {
            console.error(`❌ Failed to save ${type} scan to DB:`, err);
        }
    }


    /* ═══════════════════════════════════════════════════════════════════════
     *  EVENT HANDLERS
     * ═══════════════════════════════════════════════════════════════════════ */

    /**
     * Main scan flow — triggered when the user clicks "Scan Page".
     * 1. Show loading state
     * 2. Scrape the active tab
     * 3. Run text + image analysis in parallel
     * 4. Blend scores
     * 5. Render result UI
     * 6. Persist result to storage
     */
    async function handleScanClick() {
        showScanLoading();

        // ── Step 1: Scrape the active tab ──
        const pageData = await getPageDetails();
        console.log("Scraped page data:", pageData);

        if (pageData.error) {
            console.error("Scrape error:", pageData.error);
            showScanError();
            return;
        }

        // ── Step 2: Pick the primary (largest) image, if any ──
        const primaryImageUrl = pageData.images?.length > 0 ? pageData.images[0] : null;

        // ── Step 3: Run text & image analysis concurrently ──
        let textConfidence = 0;
        let imageResult = { score: 0, reasoning: "" };

        try {
            [textConfidence, imageResult] = await Promise.all([
                analyzeText(pageData.text),
                analyzeImage(primaryImageUrl)
            ]);

            // Persist individual results to MongoDB (non-blocking)
            if (textConfidence !== -1) saveResultsToDB(pageData, textConfidence, "text");
            if (imageResult.score !== -1 && primaryImageUrl) saveResultsToDB(pageData, imageResult.score, "image");
        } catch (err) {
            console.error("Error running parallel analysis:", err);
            textConfidence = -1;
        }

        // ── Step 4: Calculate final blended score ──
        let confidence = calculateBlendedScore(textConfidence, imageResult, !!primaryImageUrl);

        // Clamp error state to 0 for display purposes
        if (confidence === -1) {
            buildResultUI(-1, imageResult);
            confidence = 0;
        } else {
            buildResultUI(confidence, imageResult);
        }

        // ── Step 5: Update info tooltip breakdown ──
        updateInfoTooltip(
            textConfidence === -1 ? 0 : textConfidence,
            imageResult.score === -1 ? 0 : imageResult.score,
            imageResult.reasoning
        );

        // ── Step 6: Persist result to chrome.storage for popup restore ──
        saveResultToStorage({
            confidence,
            textScore: textConfidence === -1 ? 0 : textConfidence,
            imageScore: imageResult.score === -1 ? 0 : imageResult.score,
            reasoning: imageResult.reasoning,
            url: pageData.url
        });

        // ── Step 7: Transition to result view ──
        showResultView(confidence);
    }

    /**
     * Reset flow — triggered when the user clicks "Scan Again".
     * Clears the stored result and returns to the scan view.
     */
    function handleScanAgainClick() {
        clearStoredResult();
        resetToScanView();
    }
});
