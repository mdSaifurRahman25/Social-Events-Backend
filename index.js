import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

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
const eventCollection = db.collection("events");

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

// JWT Token Verification 
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    // console.log(authHeader, 'from jwt verify APi ');
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized authHeader' })
    }

    const token = authHeader.split(" ")[1];
    // console.log(token, 'from split function.');
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized Token' })
    };

    const JWKS = createRemoteJWKSet(new URL('http://localhost:3000/api/auth/jwks'));

    try {
        const { payload } = await jwtVerify(token, JWKS);
        // console.log(payload, 'from payload function');
        next();
    } catch (error) {
        return res.status(500).send({ message: 'Internal server error!' });
    }

}

// API
app.get("/", (req, res) => {
    res.send("API is working");
});

app.get("/events", async (req, res) => {
    try {
        const events = await eventCollection.find({}).sort({ date: 1 }).toArray();
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not load events." });
    }
});


app.post("/events", verifyToken, async (req, res) => {
    const problem = validateEvent(req.body);
    if (problem) {
        return res.status(400).json({ message: problem });
    }

    try {
        const {
            title,
            type,
            date,
            location,
            thumbnail,
            description,
            organizerId,
            organizerName,
            organizerEmail,
        } = req.body;

        if (
            !hasMinLength(organizerId, 1) ||
            !hasMinLength(organizerName, 1) ||
            !hasMinLength(organizerEmail, 3)
        ) {
            return res.status(400).json({ message: "Organizer details are required." });
        }

        const event = {
            title: title.trim(),
            type,
            date,
            location: location.trim(),
            thumbnail: thumbnail.trim(),
            description: description.trim(),
            organizerId: organizerId.trim(),
            organizerName: organizerName.trim(),
            organizerEmail: organizerEmail.trim(),
            createdAt: new Date(),
        };

        const result = await eventCollection.insertOne(event);
        res.status(201).json({ id: result.insertedId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Could not save the event." });
    }
});

app.get("/events/:id", verifyToken, async (req, res) => {
    const { id } = req.params;
    // console.log(id, 'from index.js event id api');

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid Events ID." });
    }

    try {
        const result = await eventCollection.findOne({ _id: new ObjectId(id) });

        if (!result) {
            return res.status(404).json({ message: "Events not found." });
        }

        return res.json({ result });
    } catch (error) {
        console.error("Failed to fetch Events:", error);
        return res.status(500).json({ message: "Failed to fetch Events." });
    }
});


// Returns only the events whose organizerId matches the query string
app.get("/my-events", verifyToken, async (req, res) => {
    const { organizerId } = req.query;

    if (typeof organizerId !== "string" || !organizerId.trim()) {
        return res.status(400).json({ message: "organizerId is required." });
    }

    try {
        const events = await eventCollection
            .find({ organizerId: organizerId.trim() })
            .sort({ createdAt: -1 })
            .toArray();

        // Expose _id as id so the frontend gets the EventItem shape directly
        res.json({
            events: events.map(({ _id, ...rest }) => ({
                id: _id.toString(),
                ...rest,
            })),
        });
    } catch (error) {
        console.error("Failed to fetch user events:", error);
        res.status(500).json({ message: "Failed to fetch your events." });
    }
});


// Deletes an event only if its organizerId matches the query string
app.delete("/events/:id", verifyToken, async (req, res) => {
    const { id } = req.params;
    const { organizerId } = req.query;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid event ID." });
    }

    if (typeof organizerId !== "string" || !organizerId.trim()) {
        return res.status(400).json({ message: "organizerId is required." });
    }

    try {
        const result = await eventCollection.deleteOne({
            _id: new ObjectId(id),
            organizerId: organizerId.trim(),
        });

        // Same response for "missing" and "not yours" so ownership is not leaked
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Event not found." });
        }

        res.json({ message: "Event deleted." });
    } catch (error) {
        console.error("Failed to delete event:", error);
        res.status(500).json({ message: "Failed to delete the event." });
    }
});

// Updates an event only if its organizerId matches the query string
app.put("/events/:id", verifyToken, async (req, res) => {
    const { id } = req.params;
    const { organizerId } = req.query;
 
    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid event ID." });
    }
 
    if (typeof organizerId !== "string" || !organizerId.trim()) {
        return res.status(400).json({ message: "organizerId is required." });
    }
 
    const problem = validateEvent(req.body);
    if (problem) {
        return res.status(400).json({ message: problem });
    }
 
    try {
        const { title, type, date, location, thumbnail, description } = req.body;
 
        const result = await eventCollection.updateOne(
            { _id: new ObjectId(id), organizerId: organizerId.trim() },
            {
                $set: {
                    title: title.trim(),
                    type,
                    date,
                    location: location.trim(),
                    thumbnail: thumbnail.trim(),
                    description: description.trim(),
                    updatedAt: new Date(),
                },
            }
        );
 
        // Same response for "missing" and "not yours" so ownership is not leaked
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Event not found." });
        }
 
        res.json({ message: "Event updated." });
    } catch (error) {
        console.error("Failed to update event:", error);
        res.status(500).json({ message: "Failed to update the event." });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
