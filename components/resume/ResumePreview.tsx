import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'

interface ResumePreviewProps {
  downloadURL: string;
  fileName: string;
  onClose: () => void;
  onDownload: () => void;
}

interface MarginData {
  top: number;
  bottom: number;
  left: number;
  right: number;
  pageWidth: number;
  pageHeight: number;
}

interface WhitespaceIndicator {
  x: number;           // screen px — left edge of the unused portion
  y: number;           // screen px — vertical position (text baseline)
  width: number;       // screen px — width of the unused portion
  lineText: string;    // concatenated text of the flagged line
  utilization: number; // fraction of full_width that this line's text occupies (0–1)
  lineX: number;       // screen px — left edge of the full content line
  lineHeight: number;  // screen px — estimated line height
  pdfY: number;        // PDF-native Y coordinate (for sorting)
}

interface SeasonIssue {
  season: string;
  year: string;
  suggestedMonth: string;
  page: number;
  baseX: number;      // viewport left at scale=1
  baseY: number;      // viewport top of text at scale=1 (from page top)
  baseWidth: number;
  baseHeight: number;
  pdfY: number;        // PDF-native Y coordinate (for sorting)
}

interface DegreeIssue {
  abbreviated: string;  // e.g. "B.S.c.."
  suggested: string;    // e.g. "Bachelor of Science in Computer Science"
  page: number;
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
  pdfY: number;        // PDF-native Y coordinate (for sorting)
}

interface ClutterIssue {
  page: number;
  baseY: number;      // viewport top of gap at scale=1
  baseHeight: number; // viewport height of gap at scale=1
  baseX: number;
  baseWidth: number;
  section1: string;
  section2: string;
  pdfY: number; // for sorting
}

interface SectionOrderIssue {
  foundOrder: string[];    // section names in document order (display case)
  expectedOrder: string[]; // expected order (display case, only present sections)
  page: number;
  pdfY: number;
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
}

interface SectionSizeIssue {
  sectionName: string;
  page: number;
  pdfY: number;
  baseX: number;
  baseY: number;
  baseWidth: number;
  baseHeight: number;
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
const MIN_SOLUTIONS_WIDTH = 360
const MAX_SOLUTIONS_WIDTH = 600
const EXPECTED_SECTION_ORDER = ['education', 'experience', 'projects', 'leadership', 'skills']
const SECTION_KEYWORD_TO_CANONICAL: Record<string, string> = {
  education: 'Education',
  experience: 'Experience',
  'academic projects': 'Projects',
  projects: 'Projects',
  leadership: 'Leadership',
  activities: 'Leadership',
  'technical skills': 'Skills',
  skills: 'Skills',
}
const MARGIN_THRESHOLD_INCHES = 0.7
const NEAR_WHITE_THRESHOLD = 230
const SECTION_KEYWORDS = ['summary', 'education', 'experience', 'projects', 'leadership', 'skills', 'technical skills', 'academic projects', 'activities']
const WHITESPACE_THRESHOLD = 0.25
const LINE_TOLERANCE_PTS = 2
const SEASON_TO_MONTH: Record<string, string> = {
  spring: 'May',
  fall:   'December',
  summer: 'August',
  winter: 'December',
}

// Each entry: abbrevRe matches the abbreviated form, fullRe detects if the formal
// version is already present (in which case we skip flagging), fullLabel is the
// recommended full degree name.
const DEGREE_CHECKS = [
  { abbrevRe: /\bB\.?[Ss]c?\.{0,3}(?![a-zA-Z])/, fullRe: /\bBachelor of Science\b/i, fullLabel: 'Bachelor of Science' },
  { abbrevRe: /\bB\.?[Aa]\.{0,2}(?![a-zA-Z])/,   fullRe: /\bBachelor of Arts\b/i,    fullLabel: 'Bachelor of Arts' },
  { abbrevRe: /\bM\.?[Ss]c?\.{0,2}(?![a-zA-Z])/, fullRe: /\bMaster of Science\b/i,   fullLabel: 'Master of Science' },
  { abbrevRe: /\bPh\.?D\.{0,2}(?![a-zA-Z])/,     fullRe: /\bDoctor of Philosophy\b/i, fullLabel: 'Doctor of Philosophy' },
  { abbrevRe: /\bM\.?B\.?A\.{0,2}(?![a-zA-Z])/,  fullRe: /\bMaster of Business Administration\b/i, fullLabel: 'Master of Business Administration' },
]

/**
 * Scans the rendered PDF canvas to detect whitespace margins on all four sides.
 * Returns margin sizes in physical canvas pixels, or null on failure.
 */
function detectWhitespaceMargins(
  canvas: HTMLCanvasElement
): { top: number; bottom: number; left: number; right: number } | null {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const w = canvas.width
    const h = canvas.height
    const { data } = ctx.getImageData(0, 0, w, h)

    const isWhitespace = (idx: number) =>
      data[idx] > NEAR_WHITE_THRESHOLD &&
      data[idx + 1] > NEAR_WHITE_THRESHOLD &&
      data[idx + 2] > NEAR_WHITE_THRESHOLD

    let top = 0
    topScan: for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!isWhitespace((y * w + x) * 4)) { top = y; break topScan }
      }
    }

    let bottom = 0
    bottomScan: for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        if (!isWhitespace((y * w + x) * 4)) { bottom = h - 1 - y; break bottomScan }
      }
    }

    let left = 0
    leftScan: for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (!isWhitespace((y * w + x) * 4)) { left = x; break leftScan }
      }
    }

    let right = 0
    rightScan: for (let x = w - 1; x >= 0; x--) {
      for (let y = 0; y < h; y++) {
        if (!isWhitespace((y * w + x) * 4)) { right = w - 1 - x; break rightScan }
      }
    }

    return { top, bottom, left, right }
  } catch {
    return null
  }
}

export default function ResumePreview({
  downloadURL,
  fileName,
  onClose,
  onDownload,
}: ResumePreviewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [marginData, setMarginData] = useState<MarginData | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [whitespaceIndicators, setWhitespaceIndicators] = useState<WhitespaceIndicator[]>([])
  const [showSolutions, setShowSolutions] = useState<boolean>(false)
  const [seasonIssues, setSeasonIssues] = useState<SeasonIssue[]>([])
  const [degreeIssues, setDegreeIssues] = useState<DegreeIssue[]>([])
  const [clutterIssues, setClutterIssues] = useState<ClutterIssue[]>([])
  const [selectedSolution, setSelectedSolution] = useState<string | null>(null)
  const [sectionOrderIssues, setSectionOrderIssues] = useState<SectionOrderIssue[]>([])
  const [sectionSizeIssues, setSectionSizeIssues] = useState<SectionSizeIssue[]>([])
  const [solutionsWidth, setSolutionsWidth] = useState(MIN_SOLUTIONS_WIDTH)

  const pageContainerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(0)

  // Configure PDF.js worker on client side only
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }, [])

  // Clear stale overlays when the page or zoom level changes
  useEffect(() => {
    setMarginData(null)
    setWhitespaceIndicators([])
  }, [pageNumber, scale])

  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = solutionsWidth
    e.preventDefault()
  }, [solutionsWidth])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return
      const newWidth = dragStartWidthRef.current + (dragStartXRef.current - e.clientX)
      setSolutionsWidth(Math.max(MIN_SOLUTIONS_WIDTH, Math.min(MAX_SOLUTIONS_WIDTH, newWidth)))
    }
    const onMouseUp = () => { isDraggingRef.current = false }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const analyzeMargins = useCallback(() => {
    const container = pageContainerRef.current
    if (!container) return

    const canvas = container.querySelector('canvas')
    if (!canvas) return

    const physWidth = canvas.width
    const cssWidth = parseFloat(canvas.style.width) || physWidth
    const physHeight = canvas.height
    const cssHeight = parseFloat(canvas.style.height) || physHeight
    const pixelRatio = physWidth / cssWidth

    const margins = detectWhitespaceMargins(canvas)
    if (!margins) return

    setMarginData({
      top: margins.top / pixelRatio,
      bottom: margins.bottom / pixelRatio,
      left: margins.left / pixelRatio,
      right: margins.right / pixelRatio,
      pageWidth: cssWidth,
      pageHeight: cssHeight,
    })
  }, [])

  /**
   * Scans every page for all "Season Year" date patterns (e.g. "Fall 2023", "Summer 2024").
   * Records viewport coordinates at scale=1 for each match so amber highlights can be
   * drawn at any zoom level. Handles season and year split across adjacent text items.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analyzeSeasonDates = useCallback(async (pdf: any) => {
    try {
      type TItem = { str: string; x: number; y: number; width: number; height: number }
      const allIssues: SeasonIssue[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const textContent = await page.getTextContent()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: TItem[] = textContent.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((item: any) => 'str' in item && (item as any).str.trim())
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => ({
            str:    item.str as string,
            x:      item.transform[4] as number,
            y:      item.transform[5] as number,
            width:  item.width as number,
            height: (item.height as number) || 12,
          }))

        const matchedIndices = new Set<number>()

        const pushIssue = (
          season: string, year: string,
          startItem: TItem, endItem: TItem
        ) => {
          const [baseX, baseYBaseline] = viewport.convertToViewportPoint(startItem.x, startItem.y)
          const [baseXRight]           = viewport.convertToViewportPoint(endItem.x + endItem.width, endItem.y)
          allIssues.push({
            season,
            year,
            suggestedMonth: SEASON_TO_MONTH[season.toLowerCase()],
            page: pageNum,
            baseX,
            baseY:      baseYBaseline - (startItem.height || 12),
            baseWidth:  baseXRight - baseX,
            baseHeight: startItem.height || 12,
            pdfY:       startItem.y,
          })
        }

        for (let i = 0; i < items.length; i++) {
          if (matchedIndices.has(i)) continue

          // ── Case 1: full "Season Year" within one item (may occur multiple times) ──
          const fullRe = /\b(Spring|Fall|Summer|Winter)\s+(\d{4})\b/gi
          let m: RegExpExecArray | null
          let foundInItem = false
          while ((m = fullRe.exec(items[i].str)) !== null) {
            pushIssue(m[1], m[2], items[i], items[i])
            matchedIndices.add(i)
            foundInItem = true
          }
          if (foundInItem) continue

          // ── Case 2: season at end of item, year at start of next item ────────────
          const trailM = items[i].str.match(/\b(Spring|Fall|Summer|Winter)\s*$/i)
          if (trailM) {
            for (let j = i + 1; j < Math.min(i + 4, items.length); j++) {
              const yearM = items[j].str.match(/^(\d{4})\b/)
              if (yearM) {
                pushIssue(trailM[1], yearM[1], items[i], items[j])
                matchedIndices.add(i)
                matchedIndices.add(j)
                break
              }
            }
          }
        }
      }

      setSeasonIssues(allIssues)
    } catch (e) {
      console.error('Season date analysis error:', e)
    }
  }, [])

  /**
   * Scans all pages for abbreviated degree names (e.g. "B.S.c..", "M.S.").
   * If the formal equivalent ("Bachelor of Science") is absent, flags the abbreviation
   * and suggests the full form with the detected major (e.g. "Bachelor of Science in
   * Computer Science").
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analyzeDegreeAbbreviations = useCallback(async (pdf: any) => {
    try {
      type TItem = { str: string; x: number; y: number; width: number; height: number }
      const allIssues: DegreeIssue[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page     = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const tc       = await page.getTextContent()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items: TItem[] = tc.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((it: any) => 'str' in it && (it as any).str.trim())
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((it: any) => ({
            str:    it.str as string,
            x:      it.transform[4] as number,
            y:      it.transform[5] as number,
            width:  it.width as number,
            height: (it.height as number) || 12,
          }))

        const fullText = items.map(i => i.str).join(' ')

        for (const check of DEGREE_CHECKS) {
          // Skip if the formal version is already present on this page
          if (check.fullRe.test(fullText)) continue

          // Find the first item whose text contains the abbreviated form
          for (let i = 0; i < items.length; i++) {
            const m = check.abbrevRe.exec(items[i].str)
            if (!m) continue

            const abbreviated = m[0]

            // Collect all items on the same line (same PDF Y ±2pt) to extract the major field
            const lineText = items
              .filter(other => Math.abs(other.y - items[i].y) <= LINE_TOLERANCE_PTS)
              .sort((a, b) => a.x - b.x)
              .map(it => it.str)
              .join(' ')
              .trim()

            // Strip the abbreviation and trailing punctuation, then cut off at the
            // graduation date / GPA line (right-aligned text on the same line)
            const escapedAbbrev = abbreviated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const field = lineText
              .replace(new RegExp(escapedAbbrev + '[.,\\s]*'), '')
              .replace(/(Graduating|Expected|GPA|University|College|\b\d{4}\b).*$/i, '')
              .replace(/^[,\s]+/, '')
              .trim()

            const suggested = field
              ? `${check.fullLabel} in ${field}`
              : check.fullLabel

            const [baseX, baseYBaseline] = viewport.convertToViewportPoint(items[i].x, items[i].y)
            const [baseXRight]           = viewport.convertToViewportPoint(items[i].x + items[i].width, items[i].y)

            allIssues.push({
              abbreviated,
              suggested,
              page: pageNum,
              baseX,
              baseY:      baseYBaseline - (items[i].height || 12),
              baseWidth:  baseXRight - baseX,
              baseHeight: items[i].height || 12,
              pdfY:       items[i].y,
            })
            break // one flag per degree type per page
          }
        }
      }

      setDegreeIssues(allIssues)
    } catch (e) {
      console.error('Degree abbreviation analysis error:', e)
    }
  }, [])

  /**
   * Uses pdfjs text content extraction to find lines in the Experience / Projects /
   * Leadership / Skills sections that leave more than 25% of line width unused.
   * Also records each line's text and utilization ratio for the Solutions panel.
   */
  const analyzeWhitespace = useCallback(async () => {
    if (!pdfDoc) return
    try {
      const page = await pdfDoc.getPage(pageNumber)
      const viewport = page.getViewport({ scale })
      const textContent = await page.getTextContent()

      // ── 1. Group text items into lines by PDF Y coordinate ─────────────────
      type LineItem = { pdfX: number; pdfXRight: number; screenY: number; str: string; height: number }
      const lineMap = new Map<number, LineItem[]>()

      for (const item of textContent.items) {
        if (!('str' in item) || !('transform' in item)) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ti = item as any
        const str: string = ti.str
        if (!str.trim()) continue

        const transform: number[] = ti.transform
        const pdfX: number = transform[4]
        const pdfY: number = transform[5]
        const pdfXRight: number = pdfX + (ti.width as number)
        const height: number = (ti.height as number) || 12
        const [, screenY] = viewport.convertToViewportPoint(pdfX, pdfY)

        let bucketKey: number | null = null
        for (const k of lineMap.keys()) {
          if (Math.abs(k - pdfY) <= LINE_TOLERANCE_PTS) { bucketKey = k; break }
        }
        const entry: LineItem = { pdfX, pdfXRight, screenY, str, height }
        if (bucketKey !== null) {
          lineMap.get(bucketKey)!.push(entry)
        } else {
          lineMap.set(pdfY, [entry])
        }
      }

      // ── 2. Identify section header lines ───────────────────────────────────
      const headerPdfYs = new Set<number>()
      let firstSectionPdfY: number | null = null

      for (const [pdfY, items] of lineMap) {
        const lineText = items.map(i => i.str).join(' ').toLowerCase().trim()
        const isHeader =
          SECTION_KEYWORDS.some(kw => lineText.includes(kw)) &&
          lineText.length < 60
        if (isHeader) {
          headerPdfYs.add(pdfY)
          if (firstSectionPdfY === null || pdfY > firstSectionPdfY) {
            firstSectionPdfY = pdfY
          }
        }
      }

      if (firstSectionPdfY === null) return

      // ── 3. Keep only lines visually below the first section header ──────────
      const relevantLines = Array.from(lineMap.entries()).filter(
        ([pdfY]) => pdfY < firstSectionPdfY! && !headerPdfYs.has(pdfY)
      )
      if (relevantLines.length === 0) return

      // ── 4. Convert endpoints to screen coordinates ─────────────────────────
      const screenLines = relevantLines.map(([pdfY, items]) => {
        const screenXStarts = items.map(i => viewport.convertToViewportPoint(i.pdfX, pdfY)[0])
        const screenXEnds   = items.map(i => viewport.convertToViewportPoint(i.pdfXRight, pdfY)[0])
        const lineText = items
          .slice()
          .sort((a, b) => a.pdfX - b.pdfX)
          .map(i => i.str)
          .join('')
          .trim()
        const avgHeight = items.reduce((s, it) => s + it.height, 0) / items.length
        return {
          pdfY,
          screenY: items[0].screenY,
          screenXLeft:  Math.min(...screenXStarts),
          screenXRight: Math.max(...screenXEnds),
          lineText,
          lineHeight: avgHeight * scale,
        }
      })

      // ── 5. Establish the reference "full line" bounds ──────────────────────
      const xLeft  = Math.min(...screenLines.map(l => l.screenXLeft))
      const xRight = Math.max(...screenLines.map(l => l.screenXRight))
      const fullWidth = xRight - xLeft
      if (fullWidth <= 0) return

      // ── 6. Flag lines with more than 25% unused space ──────────────────────
      const indicators: WhitespaceIndicator[] = []
      for (const line of screenLines) {
        const unused = xRight - line.screenXRight
        const utilization = (line.screenXRight - xLeft) / fullWidth
        if (unused / fullWidth > WHITESPACE_THRESHOLD) {
          indicators.push({
            x: line.screenXRight,
            y: line.screenY - 1,
            width: unused,
            lineText: line.lineText,
            utilization,
            lineX: xLeft,
            lineHeight: line.lineHeight,
            pdfY: line.pdfY,
          })
        }
      }

      setWhitespaceIndicators(indicators)
    } catch (e) {
      console.error('Whitespace analysis error:', e)
    }
  }, [pdfDoc, pageNumber, scale])

  const analyzeSectionSpacing = useCallback(async (pdf: any) => {
    const SPACING_THRESHOLD_PTS = (1 / 8) * 72; // 9
    const newIssues: ClutterIssue[] = [];
    if (!pdf) return;

    try {
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1 });
            const textContent = await page.getTextContent();
            
            type TItem = { str: string; x: number; y: number; width: number; height: number };
            const lineMap = new Map<number, TItem[]>();

            for (const item of textContent.items) {
                if (!('str' in item) || !item.str.trim() || !('transform' in item)) continue;
                const y = item.transform[5];
                let bucketKey: number | null = null;
                for (const k of lineMap.keys()) {
                    if (Math.abs(k - y) <= LINE_TOLERANCE_PTS) { bucketKey = k; break; }
                }
                const entry: TItem = { str: item.str, x: item.transform[4], y, width: item.width, height: item.height || 12 };
                if (bucketKey !== null) {
                    lineMap.get(bucketKey)!.push(entry);
                } else {
                    lineMap.set(y, [entry]);
                }
            }

            const allLines = Array.from(lineMap.entries()).sort((a, b) => b[0] - a[0]); // sorted top-to-bottom

            const sectionHeaders: { text: string, pdfY: number, items: TItem[] }[] = [];
            for (const [pdfY, items] of allLines) {
                const lineText = items.map(i => i.str).join(' ').toLowerCase().trim();
                const isHeader = SECTION_KEYWORDS.some(kw => lineText.startsWith(kw)) && lineText.length < 40; // shorter length for header
                if (isHeader) {
                    sectionHeaders.push({ text: items.map(i => i.str).join(''), pdfY, items });
                }
            }

            if (sectionHeaders.length < 2) continue;

            const allItems = allLines.flatMap(l => l[1]);
            if (allItems.length === 0) continue;
            const contentXMin = Math.min(...allItems.map(it => it.x));
            const contentXMax = Math.max(...allItems.map(it => it.x + it.width));

            for (let i = 0; i < sectionHeaders.length - 1; i++) {
                const header1 = sectionHeaders[i];
                const header2 = sectionHeaders[i + 1];

                const linesBetween = allLines.filter(([y]) => y < header1.pdfY && y > header2.pdfY);
                if (linesBetween.length === 0) continue;

                const [lastLineY] = linesBetween[linesBetween.length - 1]; // last line is lowest Y
                
                const header2Height = Math.max(...header2.items.map(it => it.height)) || 12;

                const gap = lastLineY - header2.pdfY - header2Height;

                if (gap < SPACING_THRESHOLD_PTS) {
                    const [baseX] = viewport.convertToViewportPoint(contentXMin, 0);
                    const [baseXMax] = viewport.convertToViewportPoint(contentXMax, 0);
                    
                    const [, baseY_top_of_gap] = viewport.convertToViewportPoint(0, lastLineY);
                    const [, baseY_bottom_of_gap] = viewport.convertToViewportPoint(0, header2.pdfY + header2Height);

                    newIssues.push({
                        page: pageNum,
                        baseY: baseY_bottom_of_gap,
                        baseHeight: baseY_top_of_gap - baseY_bottom_of_gap,
                        baseX,
                        baseWidth: baseXMax - baseX,
                        section1: header1.text,
                        section2: header2.text,
                        pdfY: header2.pdfY,
                    });
                }
            }
        }
        setClutterIssues(newIssues);
    } catch (e) {
        console.error('Section spacing analysis error:', e);
    }
}, [pdfDoc]);

  /**
   * Scans all pages to detect whether the canonical resume sections
   * (Education → Experience → Projects → Leadership → Skills) appear in the
   * correct order. Flags the first out-of-order section header.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analyzeSectionOrder = useCallback(async (pdf: any) => {
    try {
      type SectionFound = {
        canonical: string; display: string; page: number; pdfY: number
        baseX: number; baseY: number; baseWidth: number; baseHeight: number
      }
      const sectionsFound: SectionFound[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const textContent = await page.getTextContent()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type TItem = { str: string; x: number; y: number; width: number; height: number }
        const lineMap = new Map<number, TItem[]>()

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str.trim() || !('transform' in item)) continue
          const y = item.transform[5]
          let bucketKey: number | null = null
          for (const k of lineMap.keys()) {
            if (Math.abs(k - y) <= LINE_TOLERANCE_PTS) { bucketKey = k; break }
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entry: TItem = { str: item.str, x: item.transform[4], y, width: (item as any).width, height: (item as any).height || 12 }
          if (bucketKey !== null) lineMap.get(bucketKey)!.push(entry)
          else lineMap.set(y, [entry])
        }

        // Sort top-to-bottom (higher pdfY = higher on page)
        const allLines = Array.from(lineMap.entries()).sort((a, b) => b[0] - a[0])

        for (const [pdfY, items] of allLines) {
          const lineText = items.map(i => i.str).join(' ').toLowerCase().trim()
          // Check longest keywords first to avoid 'skills' matching 'technical skills'
          const matchedKeyword = Object.keys(SECTION_KEYWORD_TO_CANONICAL)
            .sort((a, b) => b.length - a.length)
            .find(kw => lineText.startsWith(kw) && lineText.length < 40)
          if (!matchedKeyword) continue

          const display = SECTION_KEYWORD_TO_CANONICAL[matchedKeyword]
          const canonical = display.toLowerCase()
          if (!EXPECTED_SECTION_ORDER.includes(canonical)) continue
          if (sectionsFound.some(s => s.canonical === canonical)) continue

          const sortedItems = items.slice().sort((a, b) => a.x - b.x)
          const [baseX, baseYViewport] = viewport.convertToViewportPoint(sortedItems[0].x, pdfY)
          const [baseXRight] = viewport.convertToViewportPoint(
            sortedItems[sortedItems.length - 1].x + sortedItems[sortedItems.length - 1].width, pdfY
          )
          const height = Math.max(...items.map(i => i.height)) || 12

          sectionsFound.push({
            canonical, display, page: pageNum, pdfY,
            baseX, baseY: baseYViewport - height,
            baseWidth: baseXRight - baseX, baseHeight: height,
          })
        }
      }

      if (sectionsFound.length < 2) return

      const foundCanonicals = sectionsFound.map(s => s.canonical)
      const expectedOrder = EXPECTED_SECTION_ORDER
        .filter(c => foundCanonicals.includes(c))
        .map(c => SECTION_KEYWORD_TO_CANONICAL[c])
      const foundOrder = sectionsFound.map(s => s.display)

      const isCorrectOrder = foundOrder.every((name, i) => name === expectedOrder[i])
      if (isCorrectOrder) return

      const firstMisplacedIdx = foundOrder.findIndex((name, i) => name !== expectedOrder[i])
      const mis = sectionsFound[firstMisplacedIdx]
      setSectionOrderIssues([{
        foundOrder, expectedOrder,
        page: mis.page, pdfY: mis.pdfY,
        baseX: mis.baseX, baseY: mis.baseY,
        baseWidth: mis.baseWidth, baseHeight: mis.baseHeight,
      }])
    } catch (e) {
      console.error('Section order analysis error:', e)
    }
  }, [])

  /**
   * Scans all pages and flags any section header whose font size is not
   * meaningfully larger than the surrounding body text (within 1pt).
   * A section title that is the same size as body text is hard to scan.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analyzeSectionTitleSize = useCallback(async (pdf: any) => {
    try {
      const allIssues: SectionSizeIssue[] = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const textContent = await page.getTextContent()

        type TItem = { str: string; x: number; y: number; width: number; height: number }
        const lineMap = new Map<number, TItem[]>()

        for (const item of textContent.items) {
          if (!('str' in item) || !item.str.trim() || !('transform' in item)) continue
          const y = item.transform[5]
          let bucketKey: number | null = null
          for (const k of lineMap.keys()) {
            if (Math.abs(k - y) <= LINE_TOLERANCE_PTS) { bucketKey = k; break }
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const entry: TItem = { str: item.str, x: item.transform[4], y, width: (item as any).width, height: (item as any).height || 12 }
          if (bucketKey !== null) lineMap.get(bucketKey)!.push(entry)
          else lineMap.set(y, [entry])
        }

        const headerLines: { pdfY: number; items: TItem[]; maxHeight: number }[] = []
        const bodyHeights: number[] = []

        for (const [pdfY, items] of lineMap) {
          const lineText = items.map(i => i.str).join(' ').toLowerCase().trim()
          const isHeader = SECTION_KEYWORDS.some(kw => lineText.startsWith(kw)) && lineText.length < 40
          const maxHeight = Math.max(...items.map(i => i.height))
          if (isHeader) {
            headerLines.push({ pdfY, items, maxHeight })
          } else {
            items.forEach(i => { if (i.height > 5 && i.height < 30) bodyHeights.push(i.height) })
          }
        }

        if (bodyHeights.length === 0 || headerLines.length === 0) continue

        bodyHeights.sort((a, b) => a - b)
        const medianBodyHeight = bodyHeights[Math.floor(bodyHeights.length / 2)]

        for (const header of headerLines) {
          if (header.maxHeight <= medianBodyHeight + 1) {
            const sortedItems = header.items.slice().sort((a, b) => a.x - b.x)
            const [baseX, baseYViewport] = viewport.convertToViewportPoint(sortedItems[0].x, header.pdfY)
            const [baseXRight] = viewport.convertToViewportPoint(
              sortedItems[sortedItems.length - 1].x + sortedItems[sortedItems.length - 1].width, header.pdfY
            )
            allIssues.push({
              sectionName: header.items.map(i => i.str).join(' ').trim(),
              page: pageNum, pdfY: header.pdfY,
              baseX, baseY: baseYViewport - header.maxHeight,
              baseWidth: baseXRight - baseX, baseHeight: header.maxHeight,
            })
          }
        }
      }

      setSectionSizeIssues(allIssues)
    } catch (e) {
      console.error('Section title size analysis error:', e)
    }
  }, [])


  const allSolutions = useMemo(() => {
    const combined = [
      ...degreeIssues.map((iss, i) => ({
        type: 'degree' as const,
        key: `degree-${i}`,
        page: iss.page,
        pdfY: iss.pdfY,
        data: iss,
      })),
      ...seasonIssues.map((iss, i) => ({
        type: 'season' as const,
        key: `season-${i}`,
        page: iss.page,
        pdfY: iss.pdfY,
        data: iss,
      })),
      ...whitespaceIndicators.map((ind, i) => ({
        type: 'whitespace' as const,
        key: `whitespace-${i}`,
        page: pageNumber, // Whitespace issues are for the current page
        pdfY: ind.pdfY,
        data: ind,
      })),
      ...clutterIssues.map((iss, i) => ({
        type: 'clutter' as const,
        key: `clutter-${i}`,
        page: iss.page,
        pdfY: iss.pdfY,
        data: iss,
      })),
      ...sectionOrderIssues.map((iss, i) => ({
        type: 'sectionOrder' as const,
        key: `sectionOrder-${i}`,
        page: iss.page,
        pdfY: iss.pdfY,
        data: iss,
      })),
      ...sectionSizeIssues.map((iss, i) => ({
        type: 'sectionSize' as const,
        key: `sectionSize-${i}`,
        page: iss.page,
        pdfY: iss.pdfY,
        data: iss,
      })),
    ];

    // Sort by page number, then by vertical position (top to bottom, so descending pdfY)
    combined.sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }
      return b.pdfY - a.pdfY; // Higher pdfY is higher on the page
    });

    return combined;
  }, [degreeIssues, seasonIssues, whitespaceIndicators, clutterIssues, sectionOrderIssues, sectionSizeIssues, pageNumber]);

  const onPageRenderSuccess = useCallback(() => {
    requestAnimationFrame(analyzeMargins)
    analyzeWhitespace()
  }, [analyzeMargins, analyzeWhitespace])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDocumentLoadSuccess = (pdf: any) => {
    setNumPages(pdf.numPages)
    setPdfDoc(pdf)
    setLoading(false)
    setError(null)
    analyzeSeasonDates(pdf)
    analyzeDegreeAbbreviations(pdf)
    analyzeSectionSpacing(pdf)
    analyzeSectionOrder(pdf)
    analyzeSectionTitleSize(pdf)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error)
    setError('Failed to load PDF. Please try again.')
    setLoading(false)
  }

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1))
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages))

  const zoomIn = () => {
    const i = ZOOM_LEVELS.indexOf(scale)
    if (i < ZOOM_LEVELS.length - 1) setScale(ZOOM_LEVELS[i + 1])
  }

  const zoomOut = () => {
    const i = ZOOM_LEVELS.indexOf(scale)
    if (i > 0) setScale(ZOOM_LEVELS[i - 1])
  }

  const canZoomIn = scale < ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
  const canZoomOut = scale > ZOOM_LEVELS[0]

  const thresholdPx = MARGIN_THRESHOLD_INCHES * 72 * scale
  const flaggedMargins = marginData
    ? {
        top:    marginData.top    > thresholdPx,
        bottom: marginData.bottom > thresholdPx,
        left:   marginData.left   > thresholdPx,
        right:  marginData.right  > thresholdPx,
      }
    : null
  const hasMarginIssue     = flaggedMargins ? Object.values(flaggedMargins).some(Boolean) : false
  const hasWhitespaceIssue = whitespaceIndicators.length > 0
  const hasSeasonIssue = seasonIssues.length > 0
  const hasDegreeIssue = degreeIssues.length > 0
  const hasClutterIssue = clutterIssues.length > 0
  const hasSectionOrderIssue = sectionOrderIssues.length > 0
  const hasSectionSizeIssue = sectionSizeIssues.length > 0
  const totalSolutionsCount = whitespaceIndicators.length + seasonIssues.length + degreeIssues.length + clutterIssues.length + sectionOrderIssues.length + sectionSizeIssues.length

  const critiqueLegends = useMemo(() => {
    const legends: { type: string, node: React.ReactNode }[] = [];
    if (hasWhitespaceIssue) {
      legends.push({
        type: 'whitespace',
        node: (
          <div key="legend-whitespace" className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-700">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.7)' }} />
            <span>Lines with &gt;25% unused space detected &mdash; consider expanding these bullet points</span>
          </div>
        ),
      });
    }
    if (hasSeasonIssue) {
      legends.push({
        type: 'season',
        node: (
          <div key="legend-season" className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-700">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(217, 119, 6, 0.5)' }} />
            <span>
              {seasonIssues.length === 1
                ? <>Date uses &ldquo;{seasonIssues[0].season} {seasonIssues[0].year}&rdquo; &mdash; consider &ldquo;{seasonIssues[0].suggestedMonth} {seasonIssues[0].year}&rdquo;</>
                : <>{seasonIssues.length} season-formatted dates found &mdash; consider using month names for consistency</>
              }
            </span>
          </div>
        ),
      });
    }
    if (hasDegreeIssue) {
      legends.push({
        type: 'degree',
        node: (
          <div key="legend-degree" className="flex items-center gap-2 px-4 py-2 bg-violet-50 border-b border-violet-200 text-sm text-violet-700">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(139, 92, 246, 0.45)' }} />
            <span>
              {degreeIssues.length === 1
                ? <>Degree &ldquo;{degreeIssues[0].abbreviated}&rdquo; is abbreviated &mdash; consider writing &ldquo;{degreeIssues[0].suggested}&rdquo;</>
                : <>{degreeIssues.length} abbreviated degree name{degreeIssues.length !== 1 ? 's' : ''} found &mdash; consider using the full formal name</>
              }
            </span>
          </div>
        ),
      });
    }
    if (hasClutterIssue) {
      legends.push({
        type: 'clutter',
        node: (
          <div key="legend-clutter" className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-200 text-sm text-orange-700">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(249, 115, 22, 0.5)' }} />
            <span>Sections are too close. Consider adding more space for readability.</span>
          </div>
        )
      })
    }
    if (hasSectionOrderIssue) {
      legends.push({
        type: 'sectionOrder',
        node: (
          <div key="legend-sectionOrder" className="flex items-center gap-2 px-4 py-2 bg-teal-50 border-b border-teal-200 text-sm text-teal-700">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(20, 184, 166, 0.5)' }} />
            <span>Resume sections are out of the standard order &mdash; consider reordering them</span>
          </div>
        )
      })
    }
    if (hasSectionSizeIssue) {
      legends.push({
        type: 'sectionSize',
        node: (
          <div key="legend-sectionSize" className="flex items-center gap-2 px-4 py-2 bg-rose-50 border-b border-rose-200 text-sm text-rose-700">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(225, 29, 72, 0.4)' }} />
            <span>
              {sectionSizeIssues.length === 1
                ? <>Section &ldquo;{sectionSizeIssues[0].sectionName}&rdquo; is the same size as body text &mdash; increase the header font size</>
                : <>{sectionSizeIssues.length} section headers are the same size as body text &mdash; increase the header font size</>
              }
            </span>
          </div>
        )
      })
    }

    const firstOfEachType = allSolutions.reduce((acc, sol) => {
      if (!acc.find(s => s.type === sol.type)) {
        acc.push({ type: sol.type, index: allSolutions.indexOf(sol) });
      }
      return acc;
    }, [] as { type: string, index: number }[]);

    firstOfEachType.sort((a, b) => a.index - b.index);

    return firstOfEachType.map(o => legends.find(l => l.type === o.type)?.node);
  }, [hasWhitespaceIssue, hasSeasonIssue, hasDegreeIssue, hasClutterIssue, hasSectionOrderIssue, hasSectionSizeIssue, seasonIssues, degreeIssues, sectionSizeIssues, allSolutions]);



  return (
    <div className="flex flex-col h-full max-h-[85vh] w-full max-w-[90vw] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-800 truncate max-w-[300px] md:max-w-[500px]">
            {fileName}
          </h2>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 bg-gray-50 border-b border-gray-200">
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} disabled={!canZoomOut} className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition" aria-label="Zoom out">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} disabled={!canZoomIn} className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition" aria-label="Zoom in">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-3">
          <button onClick={goToPrevPage} disabled={pageNumber <= 1} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Previous</button>
          <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">Page {pageNumber} / {numPages || '?'}</span>
          <button onClick={goToNextPage} disabled={pageNumber >= numPages} className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition">Next</button>
        </div>

        {/* Download Button */}
        <button onClick={onDownload} className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>

      {/* Critique Legend — margins */}
      {hasMarginIssue && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(220, 38, 38, 0.5)' }} />
          <span>Margins exceed 0.7&#34; &mdash; consider reducing to reclaim content space</span>
        </div>
      )}

      {critiqueLegends}

      {/* PDF Viewer + Solutions Sidebar */}
      <div className="flex-1 overflow-hidden flex flex-row">

        {/* PDF area */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-start justify-center">
          {loading && !error && (
            <div className="flex flex-col items-center justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
              <p className="mt-4 text-gray-600">Loading PDF...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center p-8 text-red-600">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-semibold">Failed to load PDF</p>
              <p className="text-sm text-gray-600 mt-2">{error}</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">Close</button>
            </div>
          )}

          {!error && (
            <Document file={downloadURL} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError} loading={null}>
              <div ref={pageContainerRef} style={{ position: 'relative', display: 'inline-block' }}>
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-lg"
                  onRenderSuccess={onPageRenderSuccess}
                />

                {/* Margin critique overlays */}
                {marginData && flaggedMargins && (
                  <>
                    {flaggedMargins.top    && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${marginData.top}px`, backgroundColor: 'rgba(220, 38, 38, 0.25)', pointerEvents: 'none' }} />}
                    {flaggedMargins.bottom && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${marginData.bottom}px`, backgroundColor: 'rgba(220, 38, 38, 0.25)', pointerEvents: 'none' }} />}
                    {flaggedMargins.left   && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${marginData.left}px`, backgroundColor: 'rgba(220, 38, 38, 0.25)', pointerEvents: 'none' }} />}
                    {flaggedMargins.right  && <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: `${marginData.right}px`, backgroundColor: 'rgba(220, 38, 38, 0.25)', pointerEvents: 'none' }} />}
                  </>
                )}

                {/* Clutter highlights */}
                {clutterIssues.map((iss, i) => {
                  if (iss.page !== pageNumber) return null
                  const isSelected = selectedSolution === `clutter-${i}`
                  return (
                    <div key={`clutter-${i}`} style={{
                      position: 'absolute',
                      left:   `${iss.baseX * scale}px`,
                      top:    `${iss.baseY * scale}px`,
                      width:  `${iss.baseWidth * scale}px`,
                      height: `${iss.baseHeight * scale}px`,
                      backgroundColor: isSelected ? 'rgba(249, 115, 22, 0.6)' : 'rgba(249, 115, 22, 0.3)',
                      outline: isSelected ? '2px solid rgba(234, 88, 12, 0.8)' : 'none',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'none',
                    }} />
                  )
                })}
                
                {/* Season date highlights */}
                {seasonIssues.map((iss, i) => {
                  if (iss.page !== pageNumber) return null
                  const isSelected = selectedSolution === `season-${i}`
                  const pad = isSelected ? 4 : 0
                  return (
                    <div key={`season-${i}`} style={{
                      position: 'absolute',
                      left:   `${iss.baseX * scale - pad}px`,
                      top:    `${iss.baseY * scale - pad}px`,
                      width:  `${iss.baseWidth * scale + pad * 2}px`,
                      height: `${iss.baseHeight * scale + pad * 2}px`,
                      backgroundColor: isSelected ? 'rgba(245, 158, 11, 0.75)' : 'rgba(245, 158, 11, 0.4)',
                      outline: isSelected ? '2px solid rgba(217, 119, 6, 0.9)' : 'none',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'none',
                    }} />
                  )
                })}


                {/* Degree abbreviation highlights */}
                {degreeIssues.map((iss, i) => {
                  if (iss.page !== pageNumber) return null
                  const isSelected = selectedSolution === `degree-${i}`
                  const pad = isSelected ? 4 : 0
                  return (
                    <div key={`degree-${i}`} style={{
                      position: 'absolute',
                      left:   `${iss.baseX * scale - pad}px`,
                      top:    `${iss.baseY * scale - pad}px`,
                      width:  `${iss.baseWidth * scale + pad * 2}px`,
                      height: `${iss.baseHeight * scale + pad * 2}px`,
                      backgroundColor: isSelected ? 'rgba(139, 92, 246, 0.7)' : 'rgba(139, 92, 246, 0.35)',
                      outline: isSelected ? '2px solid rgba(109, 40, 217, 0.9)' : 'none',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'none',
                    }} />
                  )
                })}

                {/* Section order highlights */}
                {sectionOrderIssues.map((iss, i) => {
                  if (iss.page !== pageNumber) return null
                  const isSelected = selectedSolution === `sectionOrder-${i}`
                  const pad = isSelected ? 4 : 0
                  return (
                    <div key={`sectionOrder-${i}`} style={{
                      position: 'absolute',
                      left:   `${iss.baseX * scale - pad}px`,
                      top:    `${iss.baseY * scale - pad}px`,
                      width:  `${iss.baseWidth * scale + pad * 2}px`,
                      height: `${iss.baseHeight * scale + pad * 2}px`,
                      backgroundColor: isSelected ? 'rgba(13, 148, 136, 0.6)' : 'rgba(13, 148, 136, 0.35)',
                      outline: isSelected ? '2px solid rgba(15, 118, 110, 0.9)' : 'none',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'none',
                    }} />
                  )
                })}

                {/* Section size highlights */}
                {sectionSizeIssues.map((iss, i) => {
                  if (iss.page !== pageNumber) return null
                  const isSelected = selectedSolution === `sectionSize-${i}`
                  const pad = isSelected ? 4 : 0
                  return (
                    <div key={`sectionSize-${i}`} style={{
                      position: 'absolute',
                      left:   `${iss.baseX * scale - pad}px`,
                      top:    `${iss.baseY * scale - pad}px`,
                      width:  `${iss.baseWidth * scale + pad * 2}px`,
                      height: `${iss.baseHeight * scale + pad * 2}px`,
                      backgroundColor: isSelected ? 'rgba(225, 29, 72, 0.6)' : 'rgba(225, 29, 72, 0.3)',
                      outline: isSelected ? '2px solid rgba(190, 18, 60, 0.9)' : 'none',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'none',
                    }} />
                  )
                })}

                {/* Line whitespace indicators */}
                {whitespaceIndicators.map((ind, i) => {
                  const isSelected = selectedSolution === `whitespace-${i}`
                  return isSelected ? (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${ind.lineX}px`,
                      top: `${ind.y - ind.lineHeight + 1}px`,
                      width: `${(ind.x + ind.width) - ind.lineX}px`,
                      height: `${ind.lineHeight}px`,
                      backgroundColor: 'rgba(59, 130, 246, 0.3)',
                      outline: '2px solid rgba(37, 99, 235, 0.8)',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'none',
                    }} />
                  ) : (
                    <div key={i} style={{
                      position: 'absolute',
                      left: `${ind.x}px`,
                      top: `${ind.y}px`,
                      width: `${ind.width}px`,
                      height: '2px',
                      backgroundColor: 'rgba(59, 130, 246, 0.7)',
                      pointerEvents: 'none',
                    }} />
                  )
                })}
              </div>
            </Document>
          )}
        </div>

        {/* Drag handle — grab to expand the Solutions panel */}
        {!error && !loading && showSolutions && (
          <div
            onMouseDown={onDragHandleMouseDown}
            className="flex-shrink-0 w-1.5 self-stretch bg-gray-200 hover:bg-teal-400 active:bg-teal-500 cursor-col-resize transition-colors"
            style={{ userSelect: 'none' }}
            title="Drag to resize"
          />
        )}

        {/* Solutions Sidebar — only rendered once the PDF is loaded */}
        {!error && !loading && (
          <div className="flex-shrink-0 flex bg-white border-l border-gray-200">

            {/* Vertical tab button (always visible) */}
            <button
              onClick={() => setShowSolutions(prev => !prev)}
              className="w-10 flex flex-col items-center justify-center gap-2 py-4 hover:bg-gray-50 transition border-r border-gray-100"
              aria-label={showSolutions ? 'Close Solutions panel' : 'Open Solutions panel'}
            >
              {/* Count badge */}
              <span
                className={`w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center ${
                  totalSolutionsCount > 0
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {totalSolutionsCount}
              </span>
              {/* Rotated label */}
              <span
                className="text-[11px] font-medium text-gray-600 select-none"
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                Solutions
              </span>
              {/* Chevron */}
              <svg
                className={`w-3 h-3 text-gray-400 transition-transform ${showSolutions ? 'rotate-90' : '-rotate-90'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Expandable panel */}
            <div
              className="overflow-hidden transition-all duration-300"
              style={{ width: showSolutions ? `${solutionsWidth}px` : '0px' }}
            >
              <div className="h-full overflow-y-auto flex flex-col" style={{ width: `${solutionsWidth}px` }}>

                {/* Panel header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Solutions
                    {totalSolutionsCount > 0 && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                        {totalSolutionsCount} issue{totalSolutionsCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Suggestions for flagged lines</p>
                </div>

                {/* Solution cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {totalSolutionsCount === 0 ? (
                     <div className="flex flex-col items-center justify-center py-8 text-center">
                       <svg className="w-8 h-8 text-green-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                       </svg>
                       <p className="text-sm text-gray-500">No issues found on this page.</p>
                     </div>
                  ) : (
                    allSolutions.map(solution => {
                      if (solution.type === 'season') {
                        const iss = solution.data;
                        const i = seasonIssues.indexOf(iss);
                        return (
                          <div
                            key={solution.key}
                            onClick={() => {
                              if (iss.page !== pageNumber) setPageNumber(iss.page)
                              setSelectedSolution(prev => prev === solution.key ? null : solution.key)
                            }}
                            className={`rounded-lg border overflow-hidden cursor-pointer transition-all bg-amber-50 ${
                              selectedSolution === solution.key
                                ? 'border-amber-500 ring-2 ring-amber-300'
                                : 'border-amber-200 hover:border-amber-400'
                            }`}
                          >
                            <div className="px-3 py-2 border-b border-amber-200 bg-white">
                              <p className="text-[11px] text-amber-600 uppercase tracking-wide font-medium mb-1">
                                Date Format{seasonIssues.length > 1 ? ` (${i + 1}/${seasonIssues.length})` : ''} — p.{iss.page}
                              </p>
                              <p className="text-xs text-gray-700 font-mono leading-relaxed border-l-2 border-amber-400 pl-2">
                                &ldquo;{iss.season} {iss.year}&rdquo;
                              </p>
                            </div>
                            <div className="p-2">
                              <div className="p-2 rounded text-xs bg-amber-100 border border-amber-300">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-amber-700">Update Format</span>
                                  <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                </div>
                                <p className="text-amber-700">
                                  Change &ldquo;{iss.season} {iss.year}&rdquo; to &ldquo;{iss.suggestedMonth} {iss.year}&rdquo; to match the month format used elsewhere on your resume.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      if (solution.type === 'degree') {
                        const iss = solution.data;
                        return (
                          <div
                            key={solution.key}
                            onClick={() => {
                              if (iss.page !== pageNumber) setPageNumber(iss.page)
                              setSelectedSolution(prev => prev === solution.key ? null : solution.key)
                            }}
                            className={`rounded-lg border overflow-hidden cursor-pointer transition-all bg-violet-50 ${
                              selectedSolution === solution.key
                                ? 'border-violet-500 ring-2 ring-violet-300'
                                : 'border-violet-200 hover:border-violet-400'
                            }`}
                          >
                            <div className="px-3 py-2 border-b border-violet-200 bg-white">
                              <p className="text-[11px] text-violet-600 uppercase tracking-wide font-medium mb-1">
                                Degree Name — p.{iss.page}
                              </p>
                              <p className="text-xs text-gray-700 font-mono leading-relaxed border-l-2 border-violet-400 pl-2">
                                &ldquo;{iss.abbreviated}&rdquo;
                              </p>
                            </div>
                            <div className="p-2">
                              <div className="p-2 rounded text-xs bg-violet-100 border border-violet-300">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-violet-700">Write in Full</span>
                                  <span className="text-[10px] bg-violet-500 text-white px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                </div>
                                <p className="text-violet-700">
                                  Change &ldquo;{iss.abbreviated}&rdquo; to &ldquo;{iss.suggested}&rdquo; for formality.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      if (solution.type === 'whitespace') {
                        const ind = solution.data;
                        const i = whitespaceIndicators.indexOf(ind);
                        const recommendShorten = ind.utilization <= 0.5
                        const choices = [
                          {
                            key: 'expand',
                            label: 'Expand',
                            desc: 'Add more detail to bring this line past the 75% threshold.',
                            recommended: !recommendShorten,
                          },
                          {
                            key: 'shorten',
                            label: 'Shorten',
                            desc: 'Try condensing this to one line by reducing word count.',
                            recommended: recommendShorten,
                          },
                        ]
                        return (
                          <div
                            key={solution.key}
                            onClick={() => setSelectedSolution(prev => prev === solution.key ? null : solution.key)}
                            className={`rounded-lg border overflow-hidden cursor-pointer transition-all ${
                              selectedSolution === solution.key
                                ? 'border-blue-500 ring-2 ring-blue-300 bg-gray-50'
                                : 'border-gray-200 bg-gray-50 hover:border-blue-300'
                            }`}
                          >
                            <div className="px-3 py-2 border-b border-gray-200 bg-white">
                              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-1">
                                Line {i + 1}
                              </p>
                              <p
                                className="text-xs text-gray-700 font-mono leading-relaxed border-l-2 border-blue-400 pl-2"
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}
                              >
                                {ind.lineText || '(empty line)'}
                              </p>
                            </div>
                            <div className="p-2 space-y-2">
                              {choices.map(choice => (
                                <div
                                  key={choice.key}
                                  className={`p-2 rounded text-xs ${
                                    choice.recommended
                                      ? 'bg-blue-50 border border-blue-200'
                                      : 'bg-white border border-gray-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={`font-semibold ${choice.recommended ? 'text-blue-700' : 'text-gray-700'}`}>
                                      {choice.label}
                                    </span>
                                    {choice.recommended && (
                                      <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-medium">
                                        Recommended
                                      </span>
                                    )}
                                  </div>
                                  <p className={choice.recommended ? 'text-blue-600' : 'text-gray-500'}>
                                    {choice.desc}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      if (solution.type === 'clutter') {
                        const iss = solution.data;
                        return (
                          <div
                            key={solution.key}
                            onClick={() => {
                              if (iss.page !== pageNumber) setPageNumber(iss.page)
                              setSelectedSolution(prev => prev === solution.key ? null : solution.key)
                            }}
                            className={`rounded-lg border overflow-hidden cursor-pointer transition-all bg-orange-50 ${
                              selectedSolution === solution.key
                                ? 'border-orange-500 ring-2 ring-orange-300'
                                : 'border-orange-200 hover:border-orange-400'
                            }`}
                          >
                            <div className="px-3 py-2 border-b border-orange-200 bg-white">
                              <p className="text-[11px] text-orange-600 uppercase tracking-wide font-medium mb-1">
                                Section Spacing — p.{iss.page}
                              </p>
                              <p className="text-xs text-gray-700 font-mono leading-relaxed border-l-2 border-orange-400 pl-2 truncate">
                                &ldquo;{iss.section1}&rdquo; &rarr; &ldquo;{iss.section2}&rdquo;
                              </p>
                            </div>
                            <div className="p-2">
                              <div className="p-2 rounded text-xs bg-orange-100 border border-orange-300">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-orange-700">Add Space</span>
                                  <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                </div>
                                <p className="text-orange-700">
                                  Increase the space between these sections to at least 1/8 inch for better readability.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      if (solution.type === 'sectionOrder') {
                        const iss = solution.data;
                        return (
                          <div
                            key={solution.key}
                            onClick={() => {
                              if (iss.page !== pageNumber) setPageNumber(iss.page)
                              setSelectedSolution(prev => prev === solution.key ? null : solution.key)
                            }}
                            className={`rounded-lg border overflow-hidden cursor-pointer transition-all bg-teal-50 ${
                              selectedSolution === solution.key
                                ? 'border-teal-500 ring-2 ring-teal-300'
                                : 'border-teal-200 hover:border-teal-400'
                            }`}
                          >
                            <div className="px-3 py-2 border-b border-teal-200 bg-white">
                              <p className="text-[11px] text-teal-600 uppercase tracking-wide font-medium mb-1">
                                Section Order — p.{iss.page}
                              </p>
                              <p className="text-xs text-gray-700 font-mono leading-relaxed border-l-2 border-teal-400 pl-2">
                                Found: {iss.foundOrder.join(' → ')}
                              </p>
                            </div>
                            <div className="p-2">
                              <div className="p-2 rounded text-xs bg-teal-100 border border-teal-300">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-teal-700">Reorder Sections</span>
                                  <span className="text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                </div>
                                <p className="text-teal-700">
                                  Rearrange your sections to match the standard order: {iss.expectedOrder.join(' → ')}.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      if (solution.type === 'sectionSize') {
                        const iss = solution.data;
                        const i = sectionSizeIssues.indexOf(iss);
                        return (
                          <div
                            key={solution.key}
                            onClick={() => {
                              if (iss.page !== pageNumber) setPageNumber(iss.page)
                              setSelectedSolution(prev => prev === solution.key ? null : solution.key)
                            }}
                            className={`rounded-lg border overflow-hidden cursor-pointer transition-all bg-rose-50 ${
                              selectedSolution === solution.key
                                ? 'border-rose-500 ring-2 ring-rose-300'
                                : 'border-rose-200 hover:border-rose-400'
                            }`}
                          >
                            <div className="px-3 py-2 border-b border-rose-200 bg-white">
                              <p className="text-[11px] text-rose-600 uppercase tracking-wide font-medium mb-1">
                                Section Header Size{sectionSizeIssues.length > 1 ? ` (${i + 1}/${sectionSizeIssues.length})` : ''} — p.{iss.page}
                              </p>
                              <p className="text-xs text-gray-700 font-mono leading-relaxed border-l-2 border-rose-400 pl-2">
                                &ldquo;{iss.sectionName}&rdquo;
                              </p>
                            </div>
                            <div className="p-2">
                              <div className="p-2 rounded text-xs bg-rose-100 border border-rose-300">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-rose-700">Increase Font Size</span>
                                  <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded font-medium">Recommended</span>
                                </div>
                                <p className="text-rose-700">
                                  This section header is the same size as body text. Increase it to 12&ndash;14pt so recruiters can quickly scan your resume.
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
