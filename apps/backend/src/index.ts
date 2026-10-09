import express from "express";
import { projectsRouter } from "./routes/projects";

const app = express();
app.use(express.json());
app.use("/api/projects", projectsRouter);
app.listen(4000, () => console.log("backend on http://localhost:4000"));
