"use client"

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setEmail(user?.email ?? null)
    })
    return () => unsubscribe()
  }, [])

  const handleLogout = async () => {
    await signOut(auth)
    router.push('/')
  }

  const linkClasses = (path: string) =>
    `block py-2 px-3 rounded-sm md:p-0 transition-colors ${
      pathname === path
        ? 'text-amber font-medium'
        : 'text-[#f5f0e8]/60 hover:text-amber'
    }`

  return (
    <nav className="bg-charcoal border-b border-white/10">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <a className="flex items-center space-x-3 rtl:space-x-reverse">
          <span className="self-center text-3xl font-display font-semibold whitespace-nowrap text-[#f5f0e8] tracking-tight">
            Rezu
          </span>
        </a>

        <div className="hidden w-full md:flex md:w-auto items-center gap-6" id="navbar-default">
          <ul className="text-base font-medium flex flex-col p-4 md:p-0 mt-4 md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0">
            <li>
              <Link href="/pages/my_resumes" className={linkClasses('/pages/my_resumes')}>My Resumes</Link>
            </li>
            <li>
              <Link href="/pages/about" className={linkClasses('/pages/about')}>About</Link>
            </li>
            <li>
              <Link href="/pages/settings" className={linkClasses('/pages/settings')}>Settings</Link>
            </li>
          </ul>

          {email && (
            <div className="flex items-center gap-3 border-l border-white/20 pl-6">
              <span className="text-sm text-[#f5f0e8]/50">{email}</span>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 bg-white/10 text-[#f5f0e8] rounded-lg hover:bg-white/20 transition"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
