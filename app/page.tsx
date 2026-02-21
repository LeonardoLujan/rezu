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

export default function Home() {
  return (
    <div className="bg-gray-50 font-sans">

      {/* Hero */}
      <div className="flex flex-col items-center justify-center min-h-[78vh]">
        <div className="text-center px-6 mb-10">
          <h1 className="text-4xl font-bold mb-4 text-gray-800">
            Can't critique your resume? Rezu can!
          </h1>
          <p className="text-lg text-gray-500">
            Trained on resumes that passed screenings at these companies:
          </p>
        </div>

        <div className="w-full overflow-hidden mb-12">
          <div className="flex animate-scroll">
            {[...logos, ...logos].map((logo, i) => (
              <div key={i} className="flex-shrink-0 flex items-center justify-center px-10">
                <img
                  src={`/carousel_images/${logo.file}`}
                  alt={logo.name}
                  className="h-12 w-auto object-contain opacity-60"
                />
              </div>
            ))}
          </div>
        </div>

        <LoginButton />
      </div>

      {/* Feature sections */}
      <div className="w-full px-8 pt-8 pb-24 space-y-16 max-w-7xl mx-auto">

        {/* Resume Preview — image left, text right */}
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="w-full md:flex-[4]">
            <img
              src="/front_page_demo_images/Resume_Preview_Image.png"
              alt="Resume preview interface"
              className="w-full rounded-xl shadow-xl border border-gray-200"
            />
          </div>
          <div className="w-full md:flex-[1] text-center md:text-left">
            <p className="text-base text-gray-600 leading-relaxed">
              Receive automatic critiques to help you improve your resume
            </p>
          </div>
        </div>

        {/* Dashboard — text left, image right */}
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="w-full md:flex-[1] text-center md:text-left">
            <p className="text-base text-gray-600 leading-relaxed">
              Manage multiple resumes at the same time
            </p>
          </div>
          <div className="w-full md:flex-[4]">
            <img
              src="/front_page_demo_images/My_Resumes_Dashboard.png"
              alt="My Resumes dashboard"
              className="w-full rounded-xl shadow-xl border border-gray-200"
            />
          </div>
        </div>

      </div>
    </div>
  )
}
