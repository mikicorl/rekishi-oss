import { Hono } from "hono"

const app = new Hono()

app.get("/", (c) => c.text("rekishi API"))

app.get("/health", (c) => c.json({ status: "ok" }))

export default app
