/**
 * Unit tests for lib/utils.ts
 *
 * A unit test follows three steps every time:
 *   1. Arrange — set up any data the function needs
 *   2. Act     — call the function
 *   3. Assert  — verify the result is what you expect
 *
 * "describe" groups related tests together.
 * "it" (or "test") is a single test case. The string should read like a sentence.
 * "expect" is how you make an assertion — if the assertion fails, the test fails.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getNextMidnightLabel,
  loadAiUsageCount,
  saveAiUsageCount,
  isAiLimitReached,
  AI_DAILY_LIMIT,
  SECTION_KEYWORD_TO_CANONICAL,
} from '../lib/utils'

// ── getNextMidnightLabel ──────────────────────────────────────────────────────
//
// This is a pure function: same situation → same output. Pure functions are the
// easiest to test because they have no side effects and no dependencies on state.

describe('getNextMidnightLabel', () => {
  it('returns a string matching the format "Month DD, 12:00 A.M."', () => {
    const result = getNextMidnightLabel()
    // toMatch() checks a regex. This one says:
    //   ^           — start of string
    //   [A-Z][a-z]+ — a word starting with a capital (e.g. "March")
    //   \s\d{2}     — a space then exactly 2 digits (e.g. " 02")
    //   , 12:00 A\.M\.$ — literal comma, time, end of string
    expect(result).toMatch(/^[A-Z][a-z]+ \d{2}, 12:00 A\.M\.$/)
  })

  it('contains tomorrow\'s day number', () => {
    const result = getNextMidnightLabel()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expectedDay = String(tomorrow.getDate()).padStart(2, '0')
    expect(result).toContain(expectedDay)
  })

  it('contains tomorrow\'s full month name', () => {
    const result = getNextMidnightLabel()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const expectedMonth = tomorrow.toLocaleString('en-US', { month: 'long' })
    expect(result).toContain(expectedMonth)
  })

  it('always ends with "12:00 A.M."', () => {
    const result = getNextMidnightLabel()
    expect(result.endsWith('12:00 A.M.')).toBe(true)
  })
})

// ── loadAiUsageCount / saveAiUsageCount ───────────────────────────────────────
//
// These functions interact with localStorage, which is a browser API.
// Vitest's jsdom environment simulates this for us, so we can test it directly.
//
// "beforeEach" runs before every test in this describe block. We use it here to
// wipe localStorage so each test starts with a clean slate — tests should never
// depend on each other's side effects.

describe('loadAiUsageCount', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns 0 when localStorage is empty', () => {
    // Arrange: nothing (localStorage was cleared in beforeEach)
    // Act
    const count = loadAiUsageCount()
    // Assert
    expect(count).toBe(0)
  })

  it('returns 0 when the stored date is not today (a past day)', () => {
    // Arrange: manually write an old record into localStorage
    localStorage.setItem('rezu_ai_usage', JSON.stringify({
      date: 'Thu Jan 01 1970', // clearly a different day
      count: 7,
    }))
    // Act & Assert: the stale data should be ignored and we get 0
    expect(loadAiUsageCount()).toBe(0)
  })

  it('returns the stored count when the date is today', () => {
    // Arrange: save a count for today using our own helper
    saveAiUsageCount(5)
    // Act & Assert
    expect(loadAiUsageCount()).toBe(5)
  })

  it('can round-trip any count value', () => {
    // Writing 9 and then reading back should give exactly 9
    saveAiUsageCount(9)
    expect(loadAiUsageCount()).toBe(9)

    // Overwriting with 10 and reading back should give exactly 10
    saveAiUsageCount(10)
    expect(loadAiUsageCount()).toBe(10)
  })
})

// ── isAiLimitReached ──────────────────────────────────────────────────────────
//
// Another pure function — no setup needed. We test the boundary conditions:
//   - below the limit (should be false)
//   - exactly at the limit (should be true)
//   - above the limit (should also be true)
//
// Testing boundary values (0, limit-1, limit, limit+1) is called
// "boundary value analysis" and catches off-by-one bugs.

describe('isAiLimitReached', () => {
  it('returns false when count is 0', () => {
    expect(isAiLimitReached(0)).toBe(false)
  })

  it('returns false when count is one below the limit', () => {
    expect(isAiLimitReached(AI_DAILY_LIMIT - 1)).toBe(false)
  })

  it('returns true when count equals the daily limit', () => {
    expect(isAiLimitReached(AI_DAILY_LIMIT)).toBe(true)
  })

  it('returns true when count exceeds the daily limit', () => {
    expect(isAiLimitReached(AI_DAILY_LIMIT + 1)).toBe(true)
  })
})

// ── SECTION_KEYWORD_TO_CANONICAL ──────────────────────────────────────────────
//
// This is a data integrity test. We're not testing a function — we're testing
// that our configuration object has the shape and values we expect.
// If someone accidentally edits the mapping, these tests will catch it.

describe('SECTION_KEYWORD_TO_CANONICAL', () => {
  it('maps the standard section keywords to their canonical names', () => {
    expect(SECTION_KEYWORD_TO_CANONICAL['education']).toBe('Education')
    expect(SECTION_KEYWORD_TO_CANONICAL['experience']).toBe('Experience')
    expect(SECTION_KEYWORD_TO_CANONICAL['projects']).toBe('Projects')
    expect(SECTION_KEYWORD_TO_CANONICAL['leadership']).toBe('Leadership')
    expect(SECTION_KEYWORD_TO_CANONICAL['skills']).toBe('Skills')
  })

  it('maps non-standard aliases to their canonical equivalents', () => {
    // These are the cases that drive the "Section Naming" critique
    expect(SECTION_KEYWORD_TO_CANONICAL['academic projects']).toBe('Projects')
    expect(SECTION_KEYWORD_TO_CANONICAL['technical skills']).toBe('Skills')
    expect(SECTION_KEYWORD_TO_CANONICAL['activities']).toBe('Leadership')
  })

  it('all canonical values start with a capital letter', () => {
    // This rule matters because the UI displays the canonical name directly
    Object.values(SECTION_KEYWORD_TO_CANONICAL).forEach(canonical => {
      expect(canonical[0]).toBe(canonical[0].toUpperCase())
    })
  })

  it('all keyword keys are lowercase', () => {
    // The critique logic lowercases the PDF text before matching,
    // so keys must also be lowercase for matches to work
    Object.keys(SECTION_KEYWORD_TO_CANONICAL).forEach(key => {
      expect(key).toBe(key.toLowerCase())
    })
  })
})
