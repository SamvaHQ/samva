import { samvaEditor } from "@samva/vite";
import { defineConfig } from "vite";

// `vite` serves the code-authored TSX entry at http://localhost:5173/.
// The SML build output and hosted publication are owned by `@samva/vite` and
// `samva templates publish`; Git owns this TSX project as the source tree.
export default defineConfig({
  plugins: [samvaEditor({ templatesDir: "emails" })],
});
