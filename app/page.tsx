import LoginButton from '@/components/login/loginbutton'

const logos = [
  { file: 'Stripe wordmark - Blurple.svg', name: 'Stripe' },
  { file: 'PATREON_Lockup_Horizontal_BLACK_RGB.png', name: 'Patreon' },
  { file: 'google_image.png', name: 'Google' },
  { file: 'logotype.svg', name: 'Duolingo' },
  { file: 'Snowflake_Logo.png', name: 'Snowflake' },
  { file: 'Atlassian_logo.png', name: 'Atlassian' },
  { file: 'primary-lockup-full-color-rgb-4000x634.png', name: 'Databricks' },
  { file: 'Splunk_logo.png', name: 'Splunk' },
  { file: 'Datadog.svg', name: 'Datadog' },
]

const critiqueChips = [
  { dot: 'bg-red-400',    label: 'Margin analysis' },
  { dot: 'bg-blue-400',   label: 'Whitespace detection' },
  { dot: 'bg-amber-400',  label: 'Date formatting' },
  { dot: 'bg-violet-400', label: 'Section naming' },
  { dot: 'bg-teal-400',   label: 'Section ordering' },
]

export default function Home() {
  return (
    <div className="bg-background font-sans">

      {/* Hero */}
      <div className="flex flex-col items-center justify-center min-h-[78vh]">
        <div className="text-center px-6 mb-10">
          <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight text-charcoal mb-4 leading-tight">
            Can't critique your resume?<br />
            <em>Rezu</em> can.
          </h1>
          <p className="text-base text-charcoal/50 mt-3">
            Built on resumes that passed screenings at these companies:
          </p>
        </div>

        <div className="w-full overflow-hidden mb-12">
          <div className="flex animate-scroll">
            {[...logos, ...logos].map((logo, i) => (
              <div key={i} className="flex-shrink-0 flex items-center justify-center px-10">
                <img
                  src={`/carousel_images/${logo.file}`}
                  alt={logo.name}
                  className="h-12 w-auto object-contain opacity-40 grayscale"
                />
              </div>
            ))}
          </div>
        </div>

        <LoginButton />
      </div>

      {/* Feature sections */}
      <div className="w-full px-8 pt-4 pb-28 space-y-24 max-w-7xl mx-auto">

        {/* Resume critique — image left, text right */}
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:flex-[4]">
            <img
              src="/front_page_demo_images/Resume_Preview_Image.png"
              alt="Resume critique interface showing highlighted issues"
              className="w-full rounded-xl border border-stone-200"
            />
          </div>
          <div className="w-full md:flex-[1.5] space-y-4">
            <p className="text-xs font-medium tracking-widest text-amber uppercase">Critique</p>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-charcoal leading-snug tracking-tight">
              See exactly what to fix
            </h2>
            <p className="text-sm text-charcoal/60 leading-relaxed">
              Rezu scans your resume and highlights formatting issues directly on the page — so you know exactly where to look.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {critiqueChips.map(chip => (
                <span
                  key={chip.label}
                  className="flex items-center gap-1.5 text-xs text-charcoal/70 bg-white border border-stone-200 px-2.5 py-1 rounded-full"
                >
                  <span className={`w-2 h-2 rounded-full ${chip.dot} opacity-80`} />
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Dashboard — text left, image right */}
        <div className="flex flex-col md:flex-row items-center gap-12">
          <div className="w-full md:flex-[1.5] space-y-4 text-center md:text-left">
            <p className="text-xs font-medium tracking-widest text-amber uppercase">Manage</p>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-charcoal leading-snug tracking-tight">
              All your resumes,<br />one place
            </h2>
            <p className="text-sm text-charcoal/60 leading-relaxed">
              Upload multiple versions of your resume and jump into a critique at any time.
            </p>
          </div>
          <div className="w-full md:flex-[4]">
            <img
              src="/front_page_demo_images/My_Resumes_Dashboard.png"
              alt="My Resumes dashboard showing uploaded resume cards"
              className="w-full rounded-xl border border-stone-200"
            />
          </div>
        </div>

      </div>
    </div>
  )
}
