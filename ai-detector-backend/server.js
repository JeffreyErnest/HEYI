/**
 * server.js — HEYI Backend API Server
 *
 * Provides the following endpoints:
 *   POST /detect-ai         — HuggingFace text classification proxy
 *   POST /api/verify-image  — Gemini image verification proxy
 *   POST /api/scan-text     — Save text scan results to MongoDB
 *   POST /api/scan-image    — Save image scan results to MongoDB
 *   GET  /api/site-warning  — Check if a domain has been flagged for AI
 */

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const { GoogleGenAI, Type } = require("@google/genai");
require("dotenv").config();


/* ═══════════════════════════════════════════════════════════════════════
 *  APP SETUP
 * ═══════════════════════════════════════════════════════════════════════ */

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/** MongoDB connection (IPv4 forced — MongoDB Atlas requires it) */
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { family: 4 });


/* ═══════════════════════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Get a MongoDB collection by name from the ai_detector_db database.
 * @param {string} name - Collection name (e.g. "pageScans", "imageScans")
 * @returns {import("mongodb").Collection}
 */
function getCollection(name) {
  return client.db("ai_detector_db").collection(name);
}


/* ═══════════════════════════════════════════════════════════════════════
 *  ROUTE: Save Text Scan
 *  POST /api/scan-text
 *
 *  Expects: { url, textHash, aiScore }
 *  aiScore should be a decimal (e.g. 0.85 = 85%)
 * ═══════════════════════════════════════════════════════════════════════ */

app.post("/api/scan-text", async (req, res) => {
  try {
    const { url, aiScore, textHash } = req.body;

    const document = {
      url,
      textHash,
      aiProbabilityScore: aiScore,
      detectedAs: aiScore > 0.5 ? "AI" : "Human",
      dateScanned: new Date(),
    };

    const result = await getCollection("pageScans").insertOne(document);
    res.status(201).json({ message: "Scan saved successfully!", documentId: result.insertedId });

  } catch (error) {
    console.error("Error saving scan:", error);
    res.status(500).json({ error: "Failed to save to database" });
  }
});


/* ═══════════════════════════════════════════════════════════════════════
 *  ROUTE: Save Image Scan
 *  POST /api/scan-image
 *
 *  Expects: { imageHash, aiScore, metadataFound }
 * ═══════════════════════════════════════════════════════════════════════ */

app.post("/api/scan-image", async (req, res) => {
  try {
    const { imageHash, aiScore, metadataFound } = req.body;

    const document = {
      imageHash,
      aiProbabilityScore: aiScore,
      metadataFound: metadataFound || false,
      detectedAs: aiScore > 0.5 ? "AI" : "Human",
      dateScanned: new Date(),
    };

    const result = await getCollection("imageScans").insertOne(document);
    res.status(201).json({ message: "Image scan saved successfully!", documentId: result.insertedId });

  } catch (error) {
    console.error("Error saving image scan:", error);
    res.status(500).json({ error: "Failed to save image to database" });
  }
});


/* ═══════════════════════════════════════════════════════════════════════
 *  ROUTE: AI Text Detection (HuggingFace Proxy)
 *  POST /detect-ai
 *
 *  Expects: { text }
 *  Returns: { aiPercentage }  (0–100)
 * ═══════════════════════════════════════════════════════════════════════ */

app.post("/detect-ai", async (req, res) => {
  try {
    const textToAnalyze = req.body.text;

    if (!textToAnalyze || textToAnalyze.trim().length === 0) {
      return res.json({ aiPercentage: 0, error: "No text provided" });
    }

    const HF_API_URL = "https://router.huggingface.co/hf-inference/models/toothsocket/ai-detector-50k";
    const HF_TOKEN = process.env.HF_TOKEN;

    console.log("Sending to HuggingFace:", HF_API_URL);
    console.log("Text length:", textToAnalyze.length, "characters");

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: textToAnalyze }),
    });

    // Read as text first to avoid JSON.parse crashes on HTML error pages
    const rawBody = await response.text();
    console.log("HF Status:", response.status);

    if (!response.ok) {
      console.error(`HuggingFace returned ${response.status}: ${rawBody}`);
      return res.json({ aiPercentage: 0, error: `HuggingFace error ${response.status}: ${rawBody}` });
    }

    // Safely parse the response body
    let result;
    try {
      result = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error("Failed to parse HF response as JSON:", rawBody);
      return res.json({ aiPercentage: 0, error: "Invalid response from HuggingFace" });
    }

    console.log("HuggingFace Parsed Result:", JSON.stringify(result));

    if (result.error) {
      console.error("HF API Error:", result.error);
      return res.json({ aiPercentage: 0, error: result.error });
    }

    // Extract the "AI" label (LABEL_1) score and convert to percentage
    // HuggingFace text-classification returns: [[{label, score}, ...]]
    let aiScore = 0;
    if (result?.[0]) {
      const aiData = result[0].find((item) => item.label === "LABEL_1");
      if (aiData) aiScore = (aiData.score * 100).toFixed(2);
    }

    res.json({ aiPercentage: aiScore });

  } catch (error) {
    console.error("Error analyzing text:", error);
    res.status(500).json({ error: "Failed to analyze text", details: error.message });
  }
});


/* ═══════════════════════════════════════════════════════════════════════
 *  ROUTE: Gemini Image Verification
 *  POST /api/verify-image
 *
 *  Expects: { imageUrl }
 *  Returns: { aiPercentage, reasoning }
 * ═══════════════════════════════════════════════════════════════════════ */

app.post("/api/verify-image", async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "No image URL provided" });
    }

    // Initialize Google Gemini SDK
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Fetch the image as a binary buffer
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error(`Failed to fetch image: ${imgResponse.status}`);

    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = imgResponse.headers.get("content-type") || "image/jpeg";

    // System prompt instructs Gemini as a forensic image analyst
    const systemInstruction = `You are a forensic image analyst specializing in detecting AI-generated images. \
Analyze the provided image for common AI artifacts such as:
- Asymmetrical or physically impossible geometry (e.g. 6 fingers, floating limbs).
- Garbled, melted, or nonsensical background text.
- Inconsistent lighting sources or missing shadows.
- AI watermarks.
- Overly smooth, "plastic", or surreal aesthetic typical of diffusion models.

Respond with a JSON object. Ensure \`aiPercentage\` is a number between 0 and 100 representing your confidence that the image is AI generated. \`reasoning\` should be a concise 1-3 sentence explanation of your findings.`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        "Please analyze this image and specify if it is AI-generated.",
        {
          inlineData: {
            data: buffer.toString("base64"),
            mimeType,
          },
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiPercentage: {
              type: Type.NUMBER,
              description: "Confidence percentage from 0 to 100 that the image is AI generated.",
            },
            reasoning: {
              type: Type.STRING,
              description: "A concise 1-3 sentence explanation of the findings.",
            },
          },
          required: ["aiPercentage", "reasoning"],
        },
      },
    });

    const jsonResult = JSON.parse(result.text);
    console.log("Gemini API Output:", jsonResult);

    res.json({
      aiPercentage: jsonResult.aiPercentage,
      reasoning: jsonResult.reasoning,
    });

  } catch (error) {
    console.error("Error verifying image with Gemini:", error);
    res.status(500).json({ error: "Failed to verify image", details: error.message });
  }
});


/* ═══════════════════════════════════════════════════════════════════════
 *  ROUTE: Site Warning Lookup
 *  GET /api/site-warning?url=https://example.com/page
 *
 *  Checks whether the domain has ever been flagged as AI in the DB.
 *  Used by background.js to fire proactive Chrome notifications.
 * ═══════════════════════════════════════════════════════════════════════ */

app.get("/api/site-warning", async (req, res) => {
  try {
    const urlToCheck = req.query.url;
    if (!urlToCheck) return res.json({ warn: false });

    // Extract the hostname (e.g. "temu.com" from "https://www.temu.com/shoes")
    const domain = new URL(urlToCheck).hostname;

    const aiFlags = await getCollection("pageScans").countDocuments({
      url: { $regex: domain, $options: "i" },
      detectedAs: "AI",
    });

    res.json(aiFlags > 0 ? { warn: true, domain } : { warn: false });

  } catch (error) {
    console.error("Warning Route Error:", error);
    res.json({ warn: false }); // fail silently so browsing isn't interrupted
  }
});


/* ═══════════════════════════════════════════════════════════════════════
 *  SERVER STARTUP
 * ═══════════════════════════════════════════════════════════════════════ */

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await client.connect();
    console.log("✅ Successfully connected to MongoDB!");

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB", err);
  }
}

startServer();