// App.tsx
import React from "react";
import PokemonPicker from "./PokemonPicker";

export default function App() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Simple Pokédex (beta)</h1>
      <PokemonPicker />
      <h3>Please note this app is actively being worked on and will have errors (such as missing and/or excess Pokémon entries)</h3>
    </main>
  );
}
