"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
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
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
const MARGIN_THRESHOLD_INCHES = 0.7
const NEAR_WHITE_THRESHOLD = 230
const SECTION_KEYWORDS = ['experience', 'projects', 'leadership', 'skills']
const WHITESPACE_THRESHOLD = 0.25
const LINE_TOLERANCE_PTS = 2

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

  const pageContainerRef = useRef<HTMLDivElement>(null)

  // Configure PDF.js worker on client side only
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }, [])

  // Clear stale overlays when the page or zoom level changes
  useEffect(() => {
    setMarginData(null)
    setWhitespaceIndicators([])
  }, [pageNumber, scale])

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
      type LineItem = { pdfX: number; pdfXRight: number; screenY: number; str: string }
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
        const [, screenY] = viewport.convertToViewportPoint(pdfX, pdfY)

        let bucketKey: number | null = null
        for (const k of lineMap.keys()) {
          if (Math.abs(k - pdfY) <= LINE_TOLERANCE_PTS) { bucketKey = k; break }
        }
        const entry: LineItem = { pdfX, pdfXRight, screenY, str }
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
        return {
          screenY: items[0].screenY,
          screenXLeft:  Math.min(...screenXStarts),
          screenXRight: Math.max(...screenXEnds),
          lineText,
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
          })
        }
      }

      setWhitespaceIndicators(indicators)
    } catch (e) {
      console.error('Whitespace analysis error:', e)
    }
  }, [pdfDoc, pageNumber, scale])

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

  return (
    <div className="flex flex-col h-full max-h-[90vh]">
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

      {/* Critique Legend — line whitespace */}
      {hasWhitespaceIssue && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-sm text-blue-700">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(59, 130, 246, 0.7)' }} />
          <span>Lines with &gt;25% unused space detected &mdash; consider expanding these bullet points</span>
        </div>
      )}

      {/* PDF Viewer + Solutions Sidebar */}
      <div className="flex-1 overflow-hidden flex flex-row">

        {/* PDF area */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center">
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

                {/* Line whitespace indicators */}
                {whitespaceIndicators.map((ind, i) => (
                  <div key={i} style={{ position: 'absolute', left: `${ind.x}px`, top: `${ind.y}px`, width: `${ind.width}px`, height: '2px', backgroundColor: 'rgba(59, 130, 246, 0.7)', pointerEvents: 'none' }} />
                ))}
              </div>
            </Document>
          )}
        </div>

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
                  whitespaceIndicators.length > 0
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {whitespaceIndicators.length}
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
              style={{ width: showSolutions ? '288px' : '0px' }}
            >
              <div className="w-72 h-full overflow-y-auto flex flex-col">

                {/* Panel header */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Solutions
                    {whitespaceIndicators.length > 0 && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                        {whitespaceIndicators.length} line{whitespaceIndicators.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Suggestions for flagged lines</p>
                </div>

                {/* Solution cards */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {whitespaceIndicators.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <svg className="w-8 h-8 text-green-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-gray-500">No line whitespace issues on this page.</p>
                    </div>
                  ) : (
                    whitespaceIndicators.map((ind, i) => {
                      // utilization <= 0.5 means the line only fills half — recommend shortening
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
                        <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                          {/* Line text preview */}
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

                          {/* Choices */}
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
                      )
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
