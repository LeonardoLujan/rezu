import LoginButton from '@/components/login/loginbutton'

const logos = [
  { file: 'stripe_logo.png', name: 'Stripe' },
  { file: 'patreon_logo.png', name: 'Patreon' },
  { file: 'google_image.png', name: 'Google' },
  { file: 'Duolingo_logo.png', name: 'Duolingo' },
  { file: 'Snowflake_Logo.png', name: 'Snowflake' },
  { file: 'Atlassian_logo.png', name: 'Atlassian' },
  { file: 'Databricks_Logo.png', name: 'Databricks' },
  { file: 'Splunk_logo.png', name: 'Splunk' },
  { file: 'Datadog_logo.png', name: 'Datadog' },
]

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 font-sans">
      <div className="text-center px-6 mb-10">
        <h1 className="text-4xl font-bold mb-4 text-gray-800">
          Can't find someone to critique your resume? Rezu can!
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
  )
}
