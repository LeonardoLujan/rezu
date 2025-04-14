"use client"
import Nav from '@/components/nav/nav'
import { withAuth } from '@/components/auth/withAuth'

function AboutPage() {
  return (
    <div>
      <Nav />
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="text-4xl font-bold">About</h1>
      </div>
    </div>
  )
}

export default withAuth(AboutPage)
