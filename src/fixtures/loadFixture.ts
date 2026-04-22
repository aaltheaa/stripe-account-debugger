// ─────────────────────────────────────────────────────────────────────────────
// Fixture loader
//
// Loads realistic Stripe-shaped JSON from src/fixtures/accounts/.
// Fixtures enable demo and testing without a live Stripe API key.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'accounts')

/** Return all available fixture names (without .json extension). */
export function listFixtures(): string[] {
  try {
    return fs
      .readdirSync(FIXTURES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      .sort()
  } catch {
    return []
  }
}

/**
 * Load a fixture by name. Returns the raw parsed JSON.
 * Throws a descriptive error if the fixture doesn't exist.
 */
export function loadFixture(name: string): unknown {
  const filePath = path.join(FIXTURES_DIR, `${name}.json`)

  if (!fs.existsSync(filePath)) {
    const available = listFixtures()
    const hint =
      available.length > 0
        ? `Available fixtures:\n${available.map(f => `  · ${f}`).join('\n')}`
        : 'No fixtures found.'
    throw new Error(`Fixture not found: "${name}"\n${hint}`)
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    throw new Error(`Failed to parse fixture "${name}". Check that the JSON is valid.`)
  }
}
