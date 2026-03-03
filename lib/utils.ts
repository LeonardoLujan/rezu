/**
 * Shared utility functions and constants.
 * Extracted here so they can be imported by both the app and the test suite.
 */

// ── AI Usage Tracking ─────────────────────────────────────────────────────────

const AI_USAGE_KEY = 'rezu_ai_usage'
export const AI_DAILY_LIMIT = 10

/**
 * Reads today's AI rewrite count from localStorage.
 * Returns 0 if no data exists or if the stored date is not today (i.e. a new day).
 */
export function loadAiUsageCount(): number {
  if (typeof window === 'undefined') return 0
  const stored = localStorage.getItem(AI_USAGE_KEY)
  if (!stored) return 0
  const parsed = JSON.parse(stored)
  if (parsed.date !== new Date().toDateString()) return 0
  return parsed.count ?? 0
}

/**
 * Persists the current AI rewrite count for today to localStorage.
 */
export function saveAiUsageCount(count: number): void {
  localStorage.setItem(AI_USAGE_KEY, JSON.stringify({
    date: new Date().toDateString(),
    count,
  }))
}

/**
 * Returns true if the user has used all their daily AI rewrites.
 */
export function isAiLimitReached(count: number): boolean {
  return count >= AI_DAILY_LIMIT
}

// ── Date Formatting ───────────────────────────────────────────────────────────

/**
 * Returns a human-readable label for tomorrow at midnight.
 * Example output: "March 02, 12:00 A.M."
 */
export function getNextMidnightLabel(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const month = tomorrow.toLocaleString('en-US', { month: 'long' })
  const day = String(tomorrow.getDate()).padStart(2, '0')
  return `${month} ${day}, 12:00 A.M.`
}

// ── Section Keyword Mapping ───────────────────────────────────────────────────

/**
 * Maps recognized section header keywords (lowercase) to their canonical display names.
 * Used by both the section order critique and the section naming critique.
 */
export const SECTION_KEYWORD_TO_CANONICAL: Record<string, string> = {
  education:          'Education',
  experience:         'Experience',
  'academic projects': 'Projects',
  projects:           'Projects',
  leadership:         'Leadership',
  activities:         'Leadership',
  'technical skills': 'Skills',
  skills:             'Skills',
}
