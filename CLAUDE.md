# Rezu — Claude Context

## Project Overview

Rezu is a resume critique and management web app aimed at computer science students. It helps them identify gaps and formatting problems in their resumes using visual overlays directly on a PDF preview.

**Mission:** Rezu aims to help computer science students identify gaps in their resume, using visual cues to help guide their critiques.

Visual cues such as red highlights to identify large margins, or blue highlights to identify unnecessary areas of whitespace will help students identify how they can critique their resume and make it appeal to recruiters, both in person and online.

This project was borne out of manually critiquing many resumes, and encountering the same consistent problems of poor formatting, not using whitespace, and not correctly defining sections of the resume such as: Education, Experience, Projects, Leadership & Skills.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.3.0 (App Router) |
| Language | TypeScript 5.x |
| Styling | Tailwind CSS v4 |
| PDF Rendering | react-pdf v10.3.0 (pdfjs-dist) |
| Auth | Firebase Auth — Google OAuth only |
| Database | Firestore (resume metadata) |
| File Storage | Firebase Cloud Storage (PDF files) |
| Runtime | React 19 |

---

## Directory Structure

```
rezu/
├── app/
│   ├── page.tsx                    # Login/landing page (public)
│   └── pages/
│       ├── my_resumes/page.tsx     # Main page — resume upload, list, preview
│       ├── about/page.tsx          # About page
│       └── settings/page.tsx       # Settings page
├── components/
│   ├── resume/ResumePreview.tsx    # PDF preview modal with critique overlays
│   ├── modal/Modal.tsx             # Generic modal wrapper
│   ├── nav/nav.tsx                 # Navigation bar
│   ├── auth/withAuth.tsx           # HOC — redirects unauthenticated users to /
│   └── login/loginbutton.tsx       # Google OAuth login/logout, redirects to /pages/my_resumes on login
└── lib/
    └── firebase.ts                 # Firebase app, auth, storage, firestore instances
```

---

## Key Conventions

- All pages under `app/pages/` are protected via the `withAuth` HOC.
- Unauthenticated users are always redirected to `/` (the login page).
- After login, users are redirected to `/pages/my_resumes` (the effective home page).
- Nav order: **My Resumes → About → Settings**.
- PDFs are stored in Firebase Storage at `resumes/{userId}/{fileName}`.
- Resume metadata (name, downloadURL, userId, timeUploaded) lives in a Firestore `resumes` collection.
- Only PDF files are accepted for upload.
- `react-pdf` renders PDFs client-side via a CDN-hosted pdfjs worker.

---

## Resume Data Model (Firestore)

```typescript
interface ResumeItem {
  id: string;           // Firestore document ID
  userId: string;       // Firebase Auth UID
  name: string;         // Original filename
  downloadURL: string;  // Firebase Storage download URL
  timeUploaded: Timestamp;
}
```

---

## Critique Feature — Current State & Roadmap

The critique system overlays visual indicators directly on the PDF canvas inside `ResumePreview.tsx`. Analysis is performed using canvas pixel scanning (computer vision) after each page render.

### Implemented
- **Margin analysis** — Scans canvas edges for whitespace. Flags any margin exceeding **0.7 inches** with a transparent red band overlay. Threshold: `0.7 * 72 * scale` CSS pixels. Re-runs on page navigation and zoom changes.

### Implemented (continued)
- **Line whitespace detection** — Uses pdfjs `getTextContent()` to extract text positions. Groups items into lines by PDF Y coordinate (±2pt tolerance). Finds the topmost section header (experience/projects/leadership/skills) and only analyses lines below it. Computes `x_left` (min line start) and `x_right` (max line end) as the reference full-width. Flags any line where `(x_right − line_end) / full_width > 0.25`. Renders a 2px blue line (`rgba(59,130,246,0.7)`) over the unused portion at the text baseline.

### Planned Visual Cues
- Section detection — Flag missing or poorly defined resume sections (Education, Experience, Projects, Leadership & Skills)

### How Canvas Analysis Works
1. react-pdf renders each PDF page to an `<canvas>` element
2. After `onRenderSuccess`, pixel data is read via `canvas.getContext('2d').getImageData()`
3. Pixels with R, G, B all > 230 are treated as whitespace
4. Margins are measured in physical canvas pixels, converted to CSS pixels (accounting for devicePixelRatio), then to inches (`cssPx / (72 * scale)`)
5. Overlay `<div>`s are absolutely positioned over the canvas inside a relative wrapper

---

## What NOT to Do

- Do not auto-commit changes unless explicitly asked.
- Do not expose or log Firebase credentials.
- Do not add features, refactoring, or cleanup beyond what is explicitly requested.
- Do not use `any` types beyond the existing auth user state unless necessary.
