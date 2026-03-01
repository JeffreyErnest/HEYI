document.addEventListener("DOMContentLoaded", () => {
    console.log("HEYI VERSION 2.0 - MESSAGING ACTIVE");
    // DOM Elements
    const scanBtn = document.getElementById("scan-btn");
    const scanBtnText = scanBtn.querySelector(".btn-text");
    const btnLoader = scanBtn.querySelector(".btn-loader");
    const scanAgainBtn = document.getElementById("scan-again-btn");
    const closeBtn = document.getElementById("close-btn");

    const viewScan = document.getElementById("view-scan");
    const viewResult = document.getElementById("view-result");

    const confidenceValueEl = document.getElementById("confidence-value");
    const progressCircle = document.querySelector(".progress-ring__circle");

    // Dynamic text elements
    const resultTitleEl = document.getElementById("result-title");
    const resultSubtitleEl = document.getElementById("result-subtitle");
    const resultDescriptionEl = document.getElementById("result-description");
    const resultBodyEl = document.querySelector(".result-body");
    const resultIconEl = document.getElementById("result-icon");

    // SVGs for Results
    const iconDanger = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#c1121f" viewBox="0 0 256 256"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"></path></svg>`;
    const iconSafe = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#2ecc71" viewBox="0 0 256 256"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"></path></svg>`;

    // Math for SVG Circle (Gauge Style: 270 degrees)
    const arcPath = document.getElementById("mask-path");
    const maxDash = arcPath.getTotalLength();
    arcPath.style.strokeDasharray = `0 ${maxDash}`;
    arcPath.style.strokeDashoffset = 0;

    // We'll generate a target confidence randomly to simulate scans
    // In a real extension, this would come from the background script API
    let targetConfidence = 0;

    function setProgress(percent) {
        const visibleLength = (percent / 100) * maxDash;
        arcPath.style.strokeDasharray = `${visibleLength} ${maxDash}`;
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            // using an easeOutQuad easing
            const easeProgress = progress * (2 - progress);
            obj.innerHTML = Math.floor(easeProgress * (end - start) + start) + "%";
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // Request the background script to perform the scrape
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

    // Function to "save" data as a JSON file via download
    function saveToJsonFile(data) {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `heyi_scan_${Date.now()}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    async function checkTextForAI(scrapedData) {
        try {
            // We take the object from the scraper and turn it into one big string
            const textToAnalyze = JSON.stringify(scrapedData);
    
            const response = await fetch("http://localhost:3000/detect-ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: textToAnalyze })
            });
    
            const data = await response.json();
            return parseFloat(data.aiPercentage); // returns the 92.34 number
        } catch (error) {
            console.error("Connection to Node server failed:", error);
            return 0; // Fallback if server is down
        }
    }

    // Interactions
    // scanBtn.addEventListener("click", async () => {
    //     // 1. Show loading state on button
    //     scanBtnText.style.opacity = "0";
    //     btnLoader.classList.remove("hidden");
    //     scanBtn.classList.remove("pulse-glow");

    //     // 2. Perform actual data extraction
    //     const pageData = await getPageDetails();
    //     console.log("Extracted Data:", pageData);

    //     // 3. Save to JSON file as requested
    //     saveToJsonFile(pageData);

    //         // Determine random result (for now)
    //         targetConfidence = await checkTextForAI(pageData);

    //         if (targetConfidence >= 50) {
    //             // AI Detected
    //             resultTitleEl.textContent = "Careful!";
    //             resultSubtitleEl.textContent = "We think this is an AI posting.";
    //             resultDescriptionEl.textContent = "This page exhibits patterns commonly found in AI-generated text. Proceed with caution when buying or evaluating.";
    //             resultIconEl.innerHTML = iconDanger;
    //         } else {
    //             // No AI Detected
    //             resultTitleEl.textContent = "All good!";
    //             resultSubtitleEl.textContent = "We don't detect AI on this page.";
    //             resultDescriptionEl.textContent = "The content on this page appears to be human-written and organic. Happy browsing!";
    //             resultIconEl.innerHTML = iconSafe;
    //         }

    //         // 5. Swap Views
    //         viewScan.classList.remove("active");

    //         setTimeout(() => {
    //             viewScan.classList.add("hidden");
    //             viewResult.classList.remove("hidden");

    //             // Allow browser to render display:block before fading in
    //             requestAnimationFrame(() => {
    //                 viewResult.classList.add("active");

    //                 // 6. Trigger Animations
    //                 setTimeout(() => {
    //                     setProgress(targetConfidence);
    //                     animateValue(confidenceValueEl, 0, targetConfidence, 1500);
    //                 }, 300); // slight delay after view shows
    //             });
    //         }, 400); // Wait for fade out
    // });

    // scanAgainBtn.addEventListener("click", () => {
    //     // Reset everything
    //     viewResult.classList.remove("active");

    //     setTimeout(() => {
    //         viewResult.classList.add("hidden");
    //         viewScan.classList.remove("hidden");

    //         // Reset Progress state
    //         setProgress(0);
    //         confidenceValueEl.innerHTML = "0%";

    //         // Reset Button State
    //         scanBtnText.style.opacity = "1";
    //         btnLoader.classList.add("hidden");
    //         scanBtn.classList.add("pulse-glow");

    //         requestAnimationFrame(() => {
    //             viewScan.classList.add("active");
    //         });
    //     }, 400); // Wait for fade out
    // });
    scanBtn.addEventListener("click", async () => {
        // 1. Loading state
        scanBtnText.style.opacity = "0";
        btnLoader.classList.remove("hidden");
        scanBtn.classList.remove("pulse-glow");

        // 2. Data extraction
        const pageData = await getPageDetails();
        
        // 3. Save JSON
        saveToJsonFile(pageData);

        // 4. CALL THE MODEL (This is where it waits for the server)
        targetConfidence = await checkTextForAI(pageData);

        // 5. Update UI based on REAL results
        if (targetConfidence >= 50) {
            resultTitleEl.textContent = "Careful!";
            // Use the real percentage in the subtitle!
            resultSubtitleEl.textContent = `We are ${targetConfidence}% sure this is AI.`; 
            resultIconEl.innerHTML = iconDanger;
        } else {
            resultTitleEl.textContent = "All good!";
            resultSubtitleEl.textContent = "Human-written content detected.";
            resultIconEl.innerHTML = iconSafe;
        }

        // 6. SWAP VIEWS
        // We move this DOWN here so it only happens AFTER the server responds
        viewScan.classList.remove("active");

        setTimeout(() => {
            viewScan.classList.add("hidden");
            viewResult.classList.remove("hidden");

            requestAnimationFrame(() => {
                viewResult.classList.add("active");
                setTimeout(() => {
                    setProgress(targetConfidence);
                    animateValue(confidenceValueEl, 0, targetConfidence, 1500);
                }, 300);
            });
        }, 400); 
    });

    // Close Popup
    closeBtn.addEventListener("click", () => {
        window.close(); // Only works when running as a real popup
    });
});
