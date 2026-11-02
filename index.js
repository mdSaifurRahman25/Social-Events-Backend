import express from "express";
import 'dotenv/config'
import cors from 'cors'
const app = express();
const port = process.env.PORT || 8000;

app.use(cors())

app.get("/", (req, res) => {
    res.send("Hello World!");
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
