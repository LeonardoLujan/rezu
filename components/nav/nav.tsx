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
    `block py-2 px-3 rounded-sm md:p-0 ${
      pathname === path
        ? 'text-white bg-purple-700 md:bg-transparent md:text-purple-700 dark:text-white md:dark:text-purple-500'
        : 'text-gray-900 hover:bg-gray-100 md:hover:bg-transparent md:border-0 md:hover:text-purple-700 dark:text-white md:dark:hover:text-purple-500 dark:hover:bg-gray-700 dark:hover:text-white md:dark:hover:bg-transparent'
    }`

  return (
    <nav className="bg-white border-gray-200 dark:bg-gray-900">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <a className="flex items-center space-x-3 rtl:space-x-reverse">
          <span className="self-center text-3xl font-semibold whitespace-nowrap dark:text-white">Rezu</span>
        </a>

        <div className="hidden w-full md:flex md:w-auto items-center gap-6" id="navbar-default">
          <ul className="text-xl font-medium flex flex-col p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0 md:bg-white dark:bg-gray-800 md:dark:bg-gray-900 dark:border-gray-700">
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
            <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
              <span className="text-sm text-gray-500">{email}</span>
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
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
