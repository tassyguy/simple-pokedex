// PokemonPicker.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

const API = "https://pokeapi.co/api/v2";
const ALL_LIMIT = 200_000; // large enough to include everything

// ---------- Minimal PokeAPI types we use ----------
type NamedAPIRef = { name: string; url: string };

type PokemonListResponse = {
  results: NamedAPIRef[];
};

type PokemonType = { type: NamedAPIRef };
type PokemonAbility = { ability: NamedAPIRef };
type PokemonStat = { base_stat: number; stat: NamedAPIRef };

type PastTypes = {
  generation: NamedAPIRef;
  types: PokemonType[];
};

// Sprite typing (fixes the 'front_default' on object error)
type SpriteLeaf = { front_default?: string | null; [k: string]: unknown };
type SpriteGenBlock = Record<string, SpriteLeaf>;     // e.g., 'red-blue', 'gold', ...
type SpriteVersions = Record<string, SpriteGenBlock>; // e.g., 'generation-i', 'generation-ii', ...

type PokemonDetails = {
  id: number;
  name: string;
  height: number; // decimeters
  weight: number; // hectograms
  types: PokemonType[];
  past_types?: PastTypes[];
  abilities: PokemonAbility[];
  stats: PokemonStat[];
  sprites: {
    front_default: string | null;
    versions?: SpriteVersions;
  };
};

type GenerationItem = NamedAPIRef; // { name: 'generation-iii', url: ... }
type GenerationDetail = {
  pokemon_species: NamedAPIRef[];
};

type VersionItem = NamedAPIRef; // /version
type VersionDetail = { version_group: NamedAPIRef | null };
type VersionGroupDetail = { generation: NamedAPIRef | null };

// ---------- Helpers ----------
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Pick a sprite that best matches a generation name like 'generation-iii' */
function pickSpriteForGeneration(
  sprites: PokemonDetails["sprites"] | undefined,
  genName: string
): string | null {
  if (!sprites) return null;
  const versions = sprites.versions;
  const genBlock: SpriteGenBlock | undefined = versions?.[genName];
  if (!genBlock) return sprites.front_default ?? null;

  // The generation block contains sub-objects (e.g., 'red-blue', 'gold', etc.).
  for (const sub of Object.values(genBlock)) {
    if (sub.front_default) {
      return String(sub.front_default);
    }
  }
  return sprites.front_default ?? null;
}

/** Get types appropriate for a generation using `past_types` if provided */
function typesForGeneration(pokemon: PokemonDetails, genName: string): string[] {
  if (!genName) {
    return pokemon.types.map((t) => cap(t.type.name));
  }
  const past = pokemon.past_types ?? [];
  const match = past.find((p) => p.generation?.name === genName);
  const arr = match ? match.types : pokemon.types;
  return arr.map((t) => cap(t.type.name));
}

interface Props {
  className?: string;
}

const PokemonPicker: React.FC<Props> = ({ className }) => {
  // Data stores
  const [allList, setAllList] = useState<NamedAPIRef[]>([]);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [generations, setGenerations] = useState<GenerationItem[]>([]);
  const [speciesByGen, setSpeciesByGen] = useState<Record<string, Set<string>>>({});

  // Selection state
  const [selectedName, setSelectedName] = useState<string>("");
  const [selectedVersionUrl, setSelectedVersionUrl] = useState<string>("");
  const [selectedGenName, setSelectedGenName] = useState<string>("");

  // Details
  const [data, setData] = useState<PokemonDetails | null>(null);

  // Loading & errors
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingPokemon, setLoadingPokemon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple cache
  const cacheRef = useRef<Map<string, PokemonDetails>>(new Map());

  // 1) Load ALL Pokémon names once
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        setLoadingList(true);
        setError(null);
        const res = await fetch(`${API}/pokemon?limit=${ALL_LIMIT}`, { signal: abort.signal });
        if (!res.ok) throw new Error(`List fetch failed: ${res.status}`);
        const json: PokemonListResponse = await res.json();
        const results = (json.results ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
        setAllList(results);
        if (results.length) setSelectedName(results[0].name);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message ?? "Failed to load Pokémon list");
      } finally {
        setLoadingList(false);
      }
    })();
    return () => abort.abort();
  }, []);

  // 2) Load versions and generations; build species sets per generation
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      try {
        setLoadingMeta(true);
        setError(null);

        // Versions (games)
        const vRes = await fetch(`${API}/version?limit=2000`, { signal: abort.signal });
        if (!vRes.ok) throw new Error(`Versions fetch failed: ${vRes.status}`);
        const vJson = (await vRes.json()) as { results: VersionItem[] };
        const vList = (vJson.results ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
        setVersions(vList);
        if (vList.length) setSelectedVersionUrl(vList[0].url);

        // Generations
        const gRes = await fetch(`${API}/generation?limit=100`, { signal: abort.signal });
        if (!gRes.ok) throw new Error(`Generations fetch failed: ${gRes.status}`);
        const gJson = (await gRes.json()) as { results: GenerationItem[] };
        const gens = (gJson.results ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
        setGenerations(gens);

        // Fetch each generation detail to map species per gen
        const map: Record<string, Set<string>> = {};
        for (const gen of gens) {
          const detRes = await fetch(gen.url, { signal: abort.signal });
          if (!detRes.ok) throw new Error(`Generation detail failed: ${detRes.status}`);
          const det = (await detRes.json()) as GenerationDetail;
          map[gen.name] = new Set((det.pokemon_species ?? []).map((s) => s.name));
        }
        setSpeciesByGen(map);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message ?? "Failed to load metadata");
      } finally {
        setLoadingMeta(false);
      }
    })();
    return () => abort.abort();
  }, []);

  // 3) Resolve selected game's generation
  useEffect(() => {
    if (!selectedVersionUrl) {
      setSelectedGenName("");
      return;
    }
    const abort = new AbortController();
    (async () => {
      try {
        setError(null);
        const vRes = await fetch(selectedVersionUrl, { signal: abort.signal });
        if (!vRes.ok) throw new Error(`Version fetch failed: ${vRes.status}`);
        const version: VersionDetail = await vRes.json();
        const vgUrl = version.version_group?.url;
        if (!vgUrl) {
          setSelectedGenName("");
          return;
        }
        const vgRes = await fetch(vgUrl, { signal: abort.signal });
        if (!vgRes.ok) throw new Error(`Version group fetch failed: ${vgRes.status}`);
        const vg: VersionGroupDetail = await vgRes.json();
        const genName = vg.generation?.name ?? "";
        setSelectedGenName(genName);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message ?? "Failed to resolve game generation");
      }
    })();
    return () => abort.abort();
  }, [selectedVersionUrl]);

  // 4) Filter Pokémon list to species introduced up to the selected generation
  const filteredList = useMemo(() => {
    if (!selectedGenName || !generations.length || !Object.keys(speciesByGen).length) {
      return allList;
    }
    const ordered = generations.map((g) => g.name); // e.g. ['generation-i', 'generation-ii', ...]
    const idx = ordered.indexOf(selectedGenName);
    if (idx === -1) return allList;

    const allowed = new Set<string>();
    for (let i = 0; i <= idx; i++) {
      const gName = ordered[i];
      for (const name of speciesByGen[gName] ?? []) allowed.add(name);
    }

    const arr = allList.filter((p) => allowed.has(p.name)).sort((a, b) => a.name.localeCompare(b.name));

    // Ensure selection stays valid when filter changes
    if (arr.length && !arr.find((x) => x.name === selectedName)) {
      queueMicrotask(() => setSelectedName(arr[0].name));
    }
    return arr;
  }, [allList, generations, selectedGenName, speciesByGen, selectedName]);

  // 5) Fetch the selected Pokémon (cached)
  useEffect(() => {
    if (!selectedName) {
      setData(null);
      return;
    }
    const cached = cacheRef.current.get(selectedName);
    if (cached) {
      setData(cached);
      return;
    }

    const abort = new AbortController();
    (async () => {
      try {
        setLoadingPokemon(true);
        setError(null);
        const res = await fetch(`${API}/pokemon/${selectedName}`, { signal: abort.signal });
        if (!res.ok) throw new Error(`Pokemon fetch failed: ${res.status}`);
        const json: PokemonDetails = await res.json();
        cacheRef.current.set(selectedName, json);
        setData(json);
      } catch (e: any) {
        if (e.name !== "AbortError") setError(e.message ?? "Failed to load Pokémon");
      } finally {
        setLoadingPokemon(false);
      }
    })();

    return () => abort.abort();
  }, [selectedName]);

  // Options
  const gameOptions = useMemo(
    () =>
      versions.map((v) => ({
        value: v.url,
        label: cap(v.name.replace(/-/g, " ")),
      })),
    [versions]
  );

  const pokemonOptions = useMemo(
    () => filteredList.map((p) => ({ value: p.name, label: cap(p.name) })),
    [filteredList]
  );

  // Generation-aware display
  const displaySprite =
    data ? pickSpriteForGeneration(data.sprites, selectedGenName) || data.sprites.front_default : null;
  const displayTypes = data ? typesForGeneration(data, selectedGenName) : [];

  return (
    <div className={className}>
      {/* Game selector */}
      <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <label htmlFor="game-select" style={{ display: "block", marginBottom: 6 }}>
            Game:
          </label>
          <select
            id="game-select"
            value={selectedVersionUrl}
            onChange={(e) => setSelectedVersionUrl(e.target.value)}
            disabled={loadingMeta || !versions.length}
            style={{ padding: 8, minWidth: 240 }}
          >
            {(!versions.length || loadingMeta) && <option>Loading games…</option>}
            {!loadingMeta &&
              versions.length > 0 &&
              gameOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
          </select>
          {selectedGenName && (
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
              Generation: {selectedGenName.replace("generation-", "Gen ").toUpperCase()}
            </div>
          )}
        </div>

        {/* Pokémon selector */}
        <div>
          <label htmlFor="pokemon-select" style={{ display: "block", marginBottom: 6 }}>
            Pokémon:
          </label>
          <select
            id="pokemon-select"
            value={selectedName}
            onChange={(e) => setSelectedName(e.target.value)}
            disabled={loadingList || loadingMeta}
            style={{ padding: 8, minWidth: 280, maxWidth: 420 }}
          >
            {(loadingList || loadingMeta) && <option>Loading…</option>}
            {!loadingList &&
              !loadingMeta &&
              pokemonOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            {pokemonOptions.length.toLocaleString()} available in this selection
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 12, color: "crimson" }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {loadingPokemon && <p>Loading Pokémon…</p>}

        {!loadingPokemon && data && (
          <article
            aria-live="polite"
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              maxWidth: 560,
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {displaySprite ? (
                <img
                  src={displaySprite}
                  alt={data.name}
                  width={96}
                  height={96}
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    background: "#f3f4f6",
                    borderRadius: 8,
                  }}
                />
              )}
              <div>
                <h2 style={{ margin: 0 }}>
                  {cap(data.name)} <small>#{data.id}</small>
                </h2>
                <p style={{ margin: "4px 0" }}>
                  Types ({selectedGenName ? selectedGenName.replace("generation-", "Gen ").toUpperCase() : "current"}):{" "}
                  {displayTypes.join(", ") || "—"}
                </p>
                <p style={{ margin: 0 }}>
                  Height: {(data.height / 10).toFixed(1)} m • Weight: {(data.weight / 10).toFixed(1)} kg
                </p>
              </div>
            </header>

            <section style={{ marginTop: 12 }}>
              <h3 style={{ margin: "12px 0 6px" }}>Abilities</h3>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                {data.abilities.map((a) => (
                  <li key={a.ability.name}>{cap(a.ability.name)}</li>
                ))}
              </ul>
            </section>

            <section style={{ marginTop: 12 }}>
              <h3 style={{ margin: "12px 0 6px" }}>Base Stats</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {data.stats.map((s) => {
                  const label = cap(s.stat.name.replace("-", " "));
                  const value = s.base_stat;
                  const pct = Math.min(100, Math.round((value / 255) * 100));
                  return (
                    <div key={s.stat.name}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          marginBottom: 2,
                        }}
                      >
                        <span>{label}</span>
                        <span>{value}</span>
                      </div>
                      <div
                        style={{
                          height: 8,
                          background: "#e5e7eb",
                          borderRadius: 999,
                          overflow: "hidden",
                        }}
                        aria-label={`${label} ${value}`}
                        role="progressbar"
                        aria-valuenow={value}
                        aria-valuemin={0}
                        aria-valuemax={255}
                      >
                        <div style={{ width: `${pct}%`, height: "100%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                Note: Base stats are the modern values exposed by PokeAPI. Typing & sprites adapt to the selected game’s
                generation via <code>past_types</code> and <code>sprites.versions</code>.
              </div>
            </section>
          </article>
        )}
      </div>
    </div>
  );
};

export default PokemonPicker;
