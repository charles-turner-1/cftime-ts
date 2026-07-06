/**
 * The runtime that powers the interactive code cells in the docs.
 *
 * It re-exports the full public API from the local library source (so examples
 * always track the real `src/`, never a stale published build). cftime-ts has
 * no runtime dependencies and needs no data, so every cell runs entirely in the
 * browser — offline, no server, no network.
 */
export * from "../../src/index.ts";
