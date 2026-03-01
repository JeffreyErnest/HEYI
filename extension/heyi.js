document.addEventListener("DOMContentLoaded", () => {
    console.log("HEYI VERSION 3.0 - LIVE AI DETECTION");

    // DOM Elements
    const scanBtn = document.getElementById("scan-btn");
    const scanBtnText = scanBtn.querySelector(".btn-text");
    const btnLoader = scanBtn.querySelector(".btn-loader");
    const scanAgainBtn = document.getElementById("scan-again-btn");
    const closeBtn = document.getElementById("close-btn");

    const viewScan = document.getElementById("view-scan");
    const viewResult = document.getElementById("view-result");

    const confidenceValueEl = document.getElementById("confidence-value");

    // Dynamic text elements
    const resultTitleEl = document.getElementById("result-title");
    const resultSubtitleEl = document.getElementById("result-subtitle");
    const resultDescriptionEl = document.getElementById("result-description");
    const resultIconEl = document.getElementById("result-icon");

    // SVGs for Results
    const iconDanger = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#c1121f" viewBox="0 0 256 256"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"></path></svg>`;
    const iconSafe = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#2ecc71" viewBox="0 0 256 256"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path></svg>`;

    // Math for SVG Circle (Gauge Style: 270 degrees)
    const arcPath = document.getElementById("mask-path");
    const maxDash = arcPath.getTotalLength();
    arcPath.style.strokeDasharray = `0 ${maxDash}`;
    arcPath.style.strokeDashoffset = 0;

    let targetConfidence = 0;

    // Backend URLs
    const GRADIO_API_URL = "https://toothsocket-heyi-detector.hf.space/gradio_api/call/analyze_text";
    const IMAGE_API_URL = "http://localhost:3000/api/verify-image";

    function setProgress(percent) {
        const visibleLength = (percent / 100) * maxDash;
        arcPath.style.strokeDasharray = `${visibleLength} ${maxDash}`;
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = progress * (2 - progress);
            obj.innerHTML = Math.floor(easeProgress * (end - start) + start) + "%";
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // Ask the background script to scrape the active tab
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

    // Send the scraped text to the AI Detector Gradio Space
    async function analyzeText(text) {
        try {
            console.log("Sending text to HuggingFace Gradio Space...");

            // Step 1: Request an event_id from the prediction queue
            // Prevent payload bloat by only sending up to 10,000 characters 
            // (The AI model will safely truncate everything past 512 tokens anyway, but this gives it the best chunk)
            const cleanText = text.length > 10000 ? text.substring(0, 10000) : text;

            const response = await fetch(GRADIO_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: [cleanText] }) // Gradio expects input in a "data" array
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

            // Step 2: Listen for the result via Server-Sent Events (SSE)
            return new Promise((resolve) => {
                const es = new EventSource(`${GRADIO_API_URL}/${event_id}`);

                es.addEventListener("complete", (event) => {
                    es.close(); // Stop listening once we have our result
                    try {
                        const resultData = JSON.parse(event.data);
                        console.log("Gradio complete data:", resultData);

                        // In Gradio 6+, resultData is the array of outputs: [{"aiPercentage": 85.2}]
                        if (resultData && resultData[0] && resultData[0].aiPercentage !== undefined) {
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
            return -1; // -1 means error (server unreachable)
        }
    }

    // Send the most prominent image to Gemini for AI verification
    async function analyzeImage(imageUrl) {
        if (!imageUrl) return { score: 0, reasoning: "" }; // Handle no image

        try {
            console.log("Sending image to Gemini Backend API...");

            const response = await fetch(IMAGE_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrl: imageUrl })
            });

            if (!response.ok) {
                console.error("HTTP error when verifying image:", response.status);
                return { score: -1, reasoning: "Failed to verify image due to a server error." };
            }

            const data = await response.json();
            console.log("Gemini Image Verification Result:", data);

            // Return BOTH the score and the reasoning
            return {
                score: data.aiPercentage || 0,
                reasoning: data.reasoning || "No reasoning provided."
            };

        } catch (error) {
            console.error("Image verification connection error:", error);
            return { score: -1, reasoning: "Failed to connect to the image analysis server." };
        }
    }

    // ── SCAN BUTTON ──
    scanBtn.addEventListener("click", async () => {
        // 1. Show loading state
        scanBtnText.style.opacity = "0";
        btnLoader.classList.remove("hidden");
        scanBtn.classList.remove("pulse-glow");

        // 2. Scrape the active tab
        const pageData = await getPageDetails();
        console.log("Scraped page data:", pageData);

        if (pageData.error) {
            console.error("Scrape error:", pageData.error);
            scanBtnText.textContent = "Error";
            scanBtnText.style.opacity = "1";
            btnLoader.classList.add("hidden");
            return;
        }

        // 3. Select a primary image to scan (using the first one found, if any exist)
        const primaryImageUrl = (pageData.images && pageData.images.length > 0) ? pageData.images[0] : null;

        // 4. Send text AND image to their respective AI backends concurrently
        let textConfidence = 0;
        let imageResult = { score: 0, reasoning: "" };

        try {
            [textConfidence, imageResult] = await Promise.all([
                analyzeText(pageData.text),
                analyzeImage(primaryImageUrl)
            ]);
            if (textConfidence !== -1) saveResultsToDB(pageData, textConfidence, "text");
            if (imageResult.score !== -1 && primaryImageUrl) saveResultsToDB(pageData, imageResult.score, "image");
        } catch (err) {
            console.error("Error running parallel analysis:", err);
            targetConfidence = -1;
        }

        // 5. Calculate Final Blended Score
        // If either backend went unreachable, fail gracefully.
        let imageConfidence = imageResult.score;
        if (textConfidence === -1 || imageConfidence === -1 || targetConfidence === -1) {
            targetConfidence = -1;
        } else if (primaryImageUrl) {
            // Both text and image were evaluated, average them!
            targetConfidence = (textConfidence + imageConfidence) / 2;
            console.log(`Blended Score: (Text: ${textConfidence}% + Image: ${imageConfidence}%) / 2 = ${targetConfidence}%`);
        } else {
            // Text only (no images on page)
            targetConfidence = textConfidence;
            console.log(`Text-Only Score: ${targetConfidence}%`);
        }

        // 4. Update UI with the REAL result
        if (targetConfidence === -1) {
            // Backend unreachable
            resultTitleEl.textContent = "Oops!";
            resultSubtitleEl.textContent = "Could not reach the analysis server.";
            resultDescriptionEl.textContent = "Make sure the backend server is running on localhost:3000. Start it with: node server.js";
            resultIconEl.innerHTML = iconDanger;
            targetConfidence = 0;
        } else if (targetConfidence >= 50) {
            // AI Detected
            resultTitleEl.textContent = "Careful!";
            resultSubtitleEl.textContent = `We are ${targetConfidence}% sure this is AI.`;
            let descriptionHTML = "This page exhibits patterns commonly found in AI-generated text. Proceed with caution when buying or evaluating.";
            if (imageResult.reasoning) {
                descriptionHTML += `<br><br><strong>Image Insights:</strong> ${imageResult.reasoning}`;
            }
            resultDescriptionEl.innerHTML = descriptionHTML;
            resultIconEl.innerHTML = iconDanger;
        } else {
            // Human content
            resultTitleEl.textContent = "All good!";
            resultSubtitleEl.textContent = "Human-written content detected.";
            let descriptionHTML = "The content on this page appears to be human-written and organic. Happy browsing!";
            if (imageResult.reasoning) {
                descriptionHTML += `<br><br><strong>Image Insights:</strong> ${imageResult.reasoning}`;
            }
            resultDescriptionEl.innerHTML = descriptionHTML;
            resultIconEl.innerHTML = iconSafe;
        }

        // 5. Swap views (only AFTER the server responds)
        viewScan.classList.remove("active");

        setTimeout(() => {
            viewScan.classList.add("hidden");
            viewResult.classList.remove("hidden");

            requestAnimationFrame(() => {
                viewResult.classList.add("active");

                // 6. Animate the ring with the REAL score
                setTimeout(() => {
                    setProgress(targetConfidence);
                    animateValue(confidenceValueEl, 0, targetConfidence, 1500);
                }, 300);
            });
        }, 400);
    });

    // ── SCAN AGAIN BUTTON ──
    scanAgainBtn.addEventListener("click", () => {
        viewResult.classList.remove("active");

        setTimeout(() => {
            viewResult.classList.add("hidden");
            viewScan.classList.remove("hidden");

            // Reset progress ring
            setProgress(0);
            confidenceValueEl.innerHTML = "0%";

            // Reset button state
            scanBtnText.textContent = "Scan Page";
            scanBtnText.style.opacity = "1";
            btnLoader.classList.add("hidden");
            scanBtn.classList.add("pulse-glow");

            requestAnimationFrame(() => {
                viewScan.classList.add("active");
            });
        }, 400);
    });

    async function saveResultsToDB(pageData, aiScore, type) {
        const endpoint = type === "image" ? "http://localhost:3000/api/scan-image" : "http://localhost:3000/api/scan-text";
        
        // Match the payload to what your server.js schema expects!
        // server.js expects aiScore as a decimal (e.g. 0.85), so we divide by 100
        const payload = type === "image" ? {
            imageHash: pageData.images[0], // Using URL as a unique identifier
            aiScore: aiScore / 100, 
            metadataFound: false
        } : {
            url: pageData.url,
            textHash: pageData.text.substring(0, 50), // Send a snippet as a hash
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

    // ── CLOSE POPUP ──
    closeBtn.addEventListener("click", () => {
        window.close();
    });
});
