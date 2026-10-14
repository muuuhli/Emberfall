import { Game } from '../src/game.js';

/** Generate the canonical world once before listening, never share its actors. */
export function createServerGameFactory({ random = Math.random } = {}) {
  const pristineWorld = new Game({ storage: null, random }).world;
  return () => new Game({ storage: null, random, worldFactory: () => structuredClone(pristineWorld) });
}
