//This file is used to troublshoot mongodb database connection issues

const { MongoClient } = require('mongodb');
require('dotenv').config();
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {family: 4}); // Have to use IPv4 because MongoDB only takes IPv4

async function run() {
  try {
    await client.connect(); // Connects to the cluster
    await client.db("admin").command({ ping: 1 }); // Sends a ping to confirm a successful connection
    console.log("MongoDB Connection was successful");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close(); // Close the connection
  }
}

run();