import { createApp } from "./app";
import { loadDeps } from "./lib/integrations";
import { createStore } from "./lib/store";

const deps = await loadDeps();
const port = Number(process.env.PORT ?? 4000);
createApp(createStore(), deps).listen(port, () => {
  console.log(`backend on http://localhost:${port}`);
  if (deps.fallbacks.length > 0) console.log(`using fallbacks for: ${deps.fallbacks.join(", ")}`);
});
