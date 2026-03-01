const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { GoogleGenAI, Type, Schema } = require('@google/genai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Tells the server to accept JSON data
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { family: 4 }); // Have to use IPv4 because MongoDB only takes IPv4

// There are two data routes for text and images, makes it more efficient and keeps DB organized
app.post('/api/scan-text', async (req, res) => {
  try {
    const { url, aiScore, textHash } = req.body; //Grabs the URL and the AI probability score sent by the model

    // Database Schema
    const newWebsiteTextScan = {
      url: url,
      textHash: textHash,
      aiProbabilityScore: aiScore,
      detectedAs: aiScore > 0.5 ? "AI" : "Human",
      dateScanned: new Date(),
    };

    await client.connect(); // Connects to MongoDB
    const database = client.db("ai_detector_db");
    const collection = database.collection("pageScans"); // saves it to the "pageScans" collection

    const result = await collection.insertOne(newWebsiteTextScan);
    res.status(201).json({ message: "Scan saved successfully!", documentId: result.insertedId }); // Sends a success message back to the chrome extension

  } catch (error) {
    console.error("Error saving scan:", error);
    res.status(500).json({ error: "Failed to save to database" });
  } finally {
    await client.close(); // Close the connection
  }
});

app.post('/api/scan-image', async (req, res) => {
  try {
    const { imageHash, aiScore, metadataFound } = req.body; // Grabs the image data sent by the chrome extension

    // Database Schema
    const newWebsiteImageScan = {
      imageHash: imageHash,
      aiProbabilityScore: aiScore,
      detectedAs: aiScore > 0.5 ? "AI" : "Human",
      metadataFound: metadataFound || false,
      dateScanned: new Date()
    };

    await client.connect(); //Connect to MongoDB
    const database = client.db("ai_detector_db");
    const collection = database.collection("imageScans"); // Saves it to the "imageScans" collection

    const result = await collection.insertOne(newWebsiteImageScan);
    res.status(201).json({ message: "Image scan saved successfully!", documentId: result.insertedId }); // Send success message back

  } catch (error) {
    console.error("Error saving image scan:", error);
    res.status(500).json({ error: "Failed to save image to database" });
  } finally {
    await client.close();
  }
});

app.post('/detect-ai', async (req, res) => {
  try {
    const textToAnalyze = req.body.text;

    if (!textToAnalyze || textToAnalyze.trim().length === 0) {
      return res.json({ aiPercentage: 0, error: "No text provided" });
    }

    // HuggingFace Inference API
    const HF_API_URL = "https://router.huggingface.co/hf-inference/models/toothsocket/ai-detector-50k";
    const HF_TOKEN = process.env.HF_TOKEN;

    console.log("Sending to HuggingFace:", HF_API_URL);
    console.log("Text length:", textToAnalyze.length, "characters");
    console.log("Token present:", !!HF_TOKEN);

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: textToAnalyze })
    });

    // Read response as text FIRST to avoid JSON parse crashes
    const rawBody = await response.text();
    console.log("HF Status:", response.status);
    console.log("HF Raw Response:", rawBody);

    // If the response is not OK, log and return error
    if (!response.ok) {
      console.error(`HuggingFace returned ${response.status}: ${rawBody}`);
      return res.json({ aiPercentage: 0, error: `HuggingFace error ${response.status}: ${rawBody}` });
    }

    // Now safely parse as JSON
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

    // Find the "AI" score (LABEL_1) and convert to a clean percentage
    let aiScore = 0;

    // HuggingFace text-classification returns: [[{label: 'LABEL_1', score: 0.92}, ...]]
    if (result && result[0]) {
      const aiData = result[0].find(item => item.label === "LABEL_1");
      if (aiData) {
        aiScore = (aiData.score * 100).toFixed(2);
      }
    }

    res.json({ aiPercentage: aiScore });

  } catch (error) {
    console.error("Error analyzing text:", error);
    res.status(500).json({ error: "Failed to analyze text", details: error.message });
  }
});

// Gemini Image Verification Endpoint
app.post('/api/verify-image', async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "No image URL provided" });
    }

    // Initialize Gemini SDK
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Fetch the image from the URL as an ArrayBuffer
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'image/jpeg';

    // Set up the system instructions and prompt
    const systemInstruction = `You are a forensic image analyst specializing in detecting AI-generated images. \
Analyze the provided image for common AI artifacts such as:
- Asymmetrical or physically impossible geometry (e.g. 6 fingers, floating limbs).
- Garbled, melted, or nonsensical background text.
- Inconsistent lighting sources or missing shadows.
- AI watermarks.
- Overly smooth, "plastic", or surreal aesthetic typical of diffusion models.

Respond with a JSON object. Ensure \`aiPercentage\` is a number between 0 and 100 representing your confidence that the image is AI generated. \`reasoning\` should be a concise 1-3 sentence explanation of your findings.`;

    const prompt = "Please analyze this image and specify if it is AI-generated.";

    // Call Gemini API and strictly request JSON output
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        prompt,
        {
          inlineData: {
            data: buffer.toString("base64"),
            mimeType: mimeType
          }
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiPercentage: {
              type: Type.NUMBER,
              description: "Confidence percentage from 0 to 100 that the image is AI generated."
            },
            reasoning: {
              type: Type.STRING,
              description: "A concise 1-3 sentence explanation of the findings."
            }
          },
          required: ["aiPercentage", "reasoning"],
        },
      }
    });

    const outputText = result.text;
    console.log("Gemini API Output:", outputText);

    // Parse the JSON response
    const jsonResult = JSON.parse(outputText);

    res.json({
      aiPercentage: jsonResult.aiPercentage,
      reasoning: jsonResult.reasoning
    });

  } catch (error) {
    console.error("Error verifying image with Gemini:", error);
    res.status(500).json({ error: "Failed to verify image", details: error.message });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});