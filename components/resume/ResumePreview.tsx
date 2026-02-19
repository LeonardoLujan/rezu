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

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]
const MARGIN_THRESHOLD_INCHES = 0.7
const NEAR_WHITE_THRESHOLD = 230

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

  const pageContainerRef = useRef<HTMLDivElement>(null)

  // Configure PDF.js worker on client side only
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }, [])

  // Clear stale margin overlays when the page or zoom level changes
  useEffect(() => {
    setMarginData(null)
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

  const onPageRenderSuccess = useCallback(() => {
    requestAnimationFrame(analyzeMargins)
  }, [analyzeMargins])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
  }

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error)
    setError('Failed to load PDF. Please try again.')
    setLoading(false)
  }

  const goToPrevPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1))
  }

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(prev + 1, numPages))
  }

  const zoomIn = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(scale)
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setScale(ZOOM_LEVELS[currentIndex + 1])
    }
  }

  const zoomOut = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(scale)
    if (currentIndex > 0) {
      setScale(ZOOM_LEVELS[currentIndex - 1])
    }
  }

  const canZoomIn = scale < ZOOM_LEVELS[ZOOM_LEVELS.length - 1]
  const canZoomOut = scale > ZOOM_LEVELS[0]

  // Compute which margins are flagged (threshold in CSS pixels at current scale)
  const thresholdPx = MARGIN_THRESHOLD_INCHES * 72 * scale
  const flaggedMargins = marginData
    ? {
        top: marginData.top > thresholdPx,
        bottom: marginData.bottom > thresholdPx,
        left: marginData.left > thresholdPx,
        right: marginData.right > thresholdPx,
      }
    : null
  const hasMarginIssue = flaggedMargins
    ? Object.values(flaggedMargins).some(Boolean)
    : false

  return (
    <div className="flex flex-col h-full max-h-[90vh]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center space-x-3">
          <svg
            className="w-6 h-6 text-purple-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
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
          <button
            onClick={zoomOut}
            disabled={!canZoomOut}
            className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Zoom out"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
              />
            </svg>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={!canZoomIn}
            className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            aria-label="Zoom in"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
              />
            </svg>
          </button>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Previous
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
            Page {pageNumber} / {numPages || '?'}
          </span>
          <button
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Next
          </button>
        </div>

        {/* Download Button */}
        <button
          onClick={onDownload}
          className="px-4 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Download
        </button>
      </div>

      {/* Critique Legend — shown when at least one margin is flagged */}
      {hasMarginIssue && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-sm text-red-700">
          <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'rgba(220, 38, 38, 0.5)' }} />
          <span>
            Margins exceed 0.7&#34; &mdash; consider reducing to reclaim content space
          </span>
        </div>
      )}

      {/* PDF Viewer Area */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4 flex items-center justify-center">
        {loading && !error && (
          <div className="flex flex-col items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            <p className="mt-4 text-gray-600">Loading PDF...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center p-8 text-red-600">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg font-semibold">Failed to load PDF</p>
            <p className="text-sm text-gray-600 mt-2">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Close
            </button>
          </div>
        )}

        {!error && (
          <Document
            file={downloadURL}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
          >
            {/* Wrapper gives us a DOM anchor for the canvas and a positioning context for overlays */}
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
                  {flaggedMargins.top && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: `${marginData.top}px`,
                        backgroundColor: 'rgba(220, 38, 38, 0.25)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {flaggedMargins.bottom && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${marginData.bottom}px`,
                        backgroundColor: 'rgba(220, 38, 38, 0.25)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {flaggedMargins.left && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${marginData.left}px`,
                        backgroundColor: 'rgba(220, 38, 38, 0.25)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                  {flaggedMargins.right && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        bottom: 0,
                        width: `${marginData.right}px`,
                        backgroundColor: 'rgba(220, 38, 38, 0.25)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </Document>
        )}
      </div>
    </div>
  )
}
