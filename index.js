import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";
import cors from "cors";

const app = express();
const port = process.env.PORT || 8000;

const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json());

// Database
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
console.log("You successfully connected to MongoDB!");

const db = client.db("kindred");
const eventDestination = db.collection("events");

// Helpers
const EVENT_TYPES = [
    "Donation",
    "Cleanup",
    "Plantation",
    "Winter Relief",
    "Food Drive",
    "Health Camp",
    "Education",
];

const hasMinLength = (value, min) =>
    typeof value === "string" && value.trim().length >= min;

const isHttpUrl = (value) => {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
};

const validateEvent = (body) => {
    const { title, type, date, location, thumbnail, description } = body ?? {};

    if (!hasMinLength(title, 5)) return "Title must be at least 5 characters.";
    if (!EVENT_TYPES.includes(type)) return "Invalid event type.";
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return "Invalid event date.";
    }
    if (date < new Date().toISOString().slice(0, 10)) {
        return "Date must be today or later.";
    }
    if (!hasMinLength(location, 3)) return "Enter the location or venue.";
    if (typeof thumbnail !== "string" || !isHttpUrl(thumbnail.trim())) {
        return "Enter a valid image URL.";
    }
    if (!hasMinLength(description, 20)) {
        return "Description must be at least 20 characters.";
    }
    return null;
};



// API
app.get("/", (req, res) => {
    res.send("API is working");
});

app.get("/events", async (req, res) => {
    try {
        const events = await eventDestination.find({}).sort({ date: 1 }).toArray();
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not load events." });
    }
});

app.post("/events", async (req, res) => {
    const problem = validateEvent(req.body);
    if (problem) {
        return res.status(400).json({ message: problem });
    }

    try {
        const { title, type, date, location, thumbnail, description } = req.body;

        const event = {
            title: title.trim(),
            type,
            date,
            location: location.trim(),
            thumbnail: thumbnail.trim(),
            description: description.trim(),
            // organizerId: req.user.id,
            // organizerName: req.user.name,
            // organizerEmail: req.user.email,
            createdAt: new Date(),
        };

        const result = await eventDestination.insertOne(event);
        res.status(201).json({ id: result.insertedId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not save the event." });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
