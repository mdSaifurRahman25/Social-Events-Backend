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
const joinCollection = db.collection("joins");

// One user can join one event only once
await joinCollection.createIndex({ eventId: 1, userId: 1 }, { unique: true });

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


// JWT Token Verification (JWKS client is created once)
const JWKS = createRemoteJWKSet(new URL(`${clientUrl}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized authHeader" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).send({ message: "Unauthorized Token" });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        req.user = {
            id: String(payload.id ?? payload.sub ?? ""),
            name: payload.name,
            email: payload.email,
        };
        next();
    } catch (error) {
        return res.status(401).send({ message: "Invalid or expired token." });
    }
};

// API
app.get("/", (req, res) => {
    res.send("API is working");
});



// Home page 6 recent events 
// Latest 6 events by creation time (public, organizer email is not exposed)
app.get("/recent-events", async (req, res) => {
    try {
        const events = await eventCollection
            .find({}, { projection: { organizerEmail: 0 } })
            .sort({ createdAt: -1, _id: -1 })
            .limit(6)
            .toArray();

        // Expose _id as id so the frontend gets a plain shape
        res.json({
            events: events.map(({ _id, ...rest }) => ({
                id: _id.toString(),
                ...rest,
            })),
        });
    } catch (error) {
        console.error("Failed to fetch recent events:", error);
        res.status(500).json({ message: "Could not load recent events." });
    }
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


// get single event details
app.get("/events/:id", verifyToken, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid Events ID." });
    }

    try {
        const result = await eventCollection.findOne({ _id: new ObjectId(id) });

        if (!result) {
            return res.status(404).json({ message: "Events not found." });
        }

        // Check whether the logged-in user has joined this event
        const joined = await joinCollection.findOne({
            eventId: result._id,
            userId: req.user.id,
        });

        return res.json({ result: { ...result, joinedByMe: !!joined } });
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

// Join an event (identity comes from the verified token, not the client)
app.post("/events/:id/join", verifyToken, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid event ID." });
    }
    if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized." });
    }

    try {
        const event = await eventCollection.findOne({ _id: new ObjectId(id) });
        if (!event) {
            return res.status(404).json({ message: "Event not found." });
        }

        await joinCollection.updateOne(
            { eventId: event._id, userId: req.user.id },
            { $setOnInsert: { joinedAt: new Date() } },
            { upsert: true }
        );

        res.status(201).json({ message: "Joined the event." });
    } catch (error) {
        console.error("Failed to join event:", error);
        res.status(500).json({ message: "Failed to join the event." });
    }
});

// Leave an event
app.delete("/events/:id/join", verifyToken, async (req, res) => {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid event ID." });
    }

    try {
        await joinCollection.deleteOne({
            eventId: new ObjectId(id),
            userId: req.user.id,
        });
        res.json({ message: "Left the event." });
    } catch (error) {
        console.error("Failed to leave event:", error);
        res.status(500).json({ message: "Failed to leave the event." });
    }
});

// Events the logged-in user has joined, in the JoinedEvent shape
app.get("/my-joined-events", verifyToken, async (req, res) => {
    try {
        const rows = await joinCollection
            .aggregate([
                { $match: { userId: req.user.id } },
                {
                    $lookup: {
                        from: "events",
                        localField: "eventId",
                        foreignField: "_id",
                        as: "event",
                    },
                },
                { $unwind: "$event" },
            ])
            .toArray();

        const events = rows.map(({ event, joinedAt }) => ({
            id: event._id.toString(),
            title: event.title,
            type: event.type,
            date: event.date,
            location: event.location,
            thumbnail: event.thumbnail,
            description: event.description,
            organizerName: event.organizerName ?? "",
            joinedAt: new Date(joinedAt).toISOString().slice(0, 10),
        }));

        res.json({ events });
    } catch (error) {
        console.error("Failed to fetch joined events:", error);
        res.status(500).json({ message: "Failed to fetch your joined events." });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
