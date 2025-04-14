"use client"

import { useEffect, useState } from "react"
import { auth } from "@/lib/firebase"
import { useRouter } from "next/navigation"

export function withAuth(Component: React.FC) {
  return function ProtectedComponent() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
      const unsubscribe = auth.onAuthStateChanged((currentUser) => {
        if (!currentUser) {
          router.push("/")
        } else {
          setUser(currentUser)
          setLoading(false)
        }
      })
      return () => unsubscribe()
    }, [])

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-600 text-lg">Checking authentication...</p>
        </div>
      )
    }

    return <Component />
  }
}
