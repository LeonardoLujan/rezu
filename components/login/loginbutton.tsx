"use client"

import { auth, googleProvider } from '@/lib/firebase'
import { signInWithPopup, signOut } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginButton() {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user)
      // Redirect once user logs in
      if (user) {
        router.push('/pages/my_resumes')
      }
    })
    return () => unsubscribe()
  }, [])

  const handleLogin = async () => {
    await signInWithPopup(auth, googleProvider)
  }

  const handleLogout = async () => {
    await signOut(auth)
    setUser(null)
    router.push('/') // Optionally redirect to login screen
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      {user ? (
        <>
          <p className="text-lg">Welcome, {user.displayName}</p>
          <button
            onClick={handleLogout}
            className="px-6 py-2 bg-gray-300 text-black rounded hover:bg-gray-400"
          >
            Logout
          </button>
        </>
      ) : (
        <button
          onClick={handleLogin}
          className="transition-opacity hover:opacity-80"
        >
          <Image
            src="/sign_in_images/sign_up_with_google.svg"
            alt="Sign in with Google"
            width={179}
            height={40}
          />
        </button>
      )}
    </div>
  )
}
