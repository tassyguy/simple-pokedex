import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Replace with your repo name for GitHub Pages
const repoName = "simple-pokedex";

export default defineConfig({
  plugins: [react()],
  base: `/${repoName}/`,
  // Optional: path alias like CRA's src absolute imports
  resolve: {
    alias: {
      "@": "/src"
    }
  }
});
