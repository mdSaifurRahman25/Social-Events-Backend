import express from "express";
import { MongoClient } from 'mongodb';
import 'dotenv/config'
import cors from 'cors'
const app = express();
const port = process.env.PORT || 8000;

app.use(cors())

app.get("/", (req, res) => {
    res.send("Hello World!");
});


const client = new MongoClient(process.env.MONGODB_URI); 

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}


app.listen(port, async () => {
   await connectToMongoDB(); 
    console.log(`Server is running at http://localhost:${port}`);
});
