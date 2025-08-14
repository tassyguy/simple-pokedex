// App.tsx
import React from "react";
import PokemonPicker from "./PokemonPicker";

export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Simon's Simple Pokédex (beta)</h1>
      <p>This app was built by Simon Phillips.</p><a href="https://github.com/tassyguy">Check out my GitHub repo for more coding projects!</a>
      <p>This was built using TypeScript, React, Vite, GitHub Actions, the PokéAPI, Node.js, and pure determination.</p>
      <PokemonPicker />
      <h3>Please note this app is actively being worked on and will have errors (such as missing and/or excess Pokémon entries)</h3>
      <h3>More features will be added as time goes along</h3>
    </main>
  );
}
