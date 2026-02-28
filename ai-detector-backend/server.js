const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // Tells the server to accept JSON data

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

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});