const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
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

  // Make sure you have standard imports like express and a way to parse JSON body
// app.use(express.json());

app.post('/detect-ai', async (req, res) => {
  try {
      const textToAnalyze = req.body.text;

      // 1. Send the text to your Hugging Face API
      // Swap in your REAL username and model name here!
      const HF_API_URL = "https://api-inference.huggingface.co/models/toothsocket/my-ai-detector";
      
      // SECURITY TIP: In a real app, put this token in a .env file!
      const HF_TOKEN = "YOUR_HUGGING_FACE_ACCESS_TOKEN"; 

      const response = await fetch(HF_API_URL, {
          method: "POST",
          headers: {
              "Authorization": `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json"
          },
          body: JSON.stringify({ inputs: textToAnalyze })
      });

      // 2. Parse the result from Hugging Face
      const result = await response.json();
      console.log("Hugging Face Raw Result:", JSON.stringify(result));

      if (result.error) {
        console.error("HF API Error:", result.error);
        return res.json({ aiPercentage: 0 });
      }

      // 3. Find the "AI" score (LABEL_1) and convert to a clean percentage
      let aiScore = 0;
      
      // Hugging Face returns an array of arrays like: [[{label: 'LABEL_1', score: 0.92}, ...]]
      if (result && result[0]) {
          const aiData = result[0].find(item => item.label === "LABEL_1");
          if (aiData) {
              aiScore = (aiData.score * 100).toFixed(2); // Turns 0.9234 into "92.34"
          }
      }

      // 4. Send the final clean percentage back to the Chrome Extension
      res.json({ aiPercentage: aiScore });

  } catch (error) {
      console.error("Error analyzing text:", error);
      res.status(500).json({ error: "Failed to analyze text" });
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});