"use client"

import Nav from '@/components/nav/nav'
import { useRef, useState, useEffect } from 'react'
import { auth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'
import { ref, uploadBytes, getDownloadURL } from "firebase/storage"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { storage, firestore } from "@/lib/firebase"


export default function My_Resumes() {
  const [file, setFile] = useState<File | null>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Auth protection
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        router.push('/') // Redirect to login if not signed in
      } else {
        setUser(currentUser)
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
  }

  const handleUpload = async () => {
    if (!file || !user) return alert("Please select a file and login.")
  
    try {
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`)
      const snapshot = await uploadBytes(storageRef, file)
      const downloadURL = await getDownloadURL(snapshot.ref)
  
      await addDoc(collection(firestore, "resumes"), {
        userId: user.uid,
        name: file.name,
        timeUploaded: serverTimestamp(),
        downloadURL,
      })
  
      alert("Resume uploaded successfully!")
      setFile(null) // Reset selection
    } catch (err) {
      console.error("Upload failed:", err)
      alert("Upload failed. Check the console for details.")
    }
  }
  

  if (loading) {
    return (
      <>
        <Nav />
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-lg text-gray-600">Checking authentication...</p>
        </div>
      </>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <Nav />

      <div className="flex flex-col items-center justify-center p-4 mt-8">
        <h1 className="text-4xl font-bold mb-6">Upload Resume</h1>

        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={handleFileSelect}
          className="mb-4 px-6 py-2 border border-gray-400 text-gray-700 bg-white rounded hover:bg-gray-100 transition"
        >
          Choose File
        </button>

        {file && <p className="mb-4 text-gray-600">Selected: {file.name}</p>}

        <button
          onClick={handleUpload}
          className="px-6 py-2 bg-purple-700 text-white rounded hover:bg-purple-800 transition"
        >
          Upload File
        </button>
      </div>

      <main className="flex flex-col items-center justify-center px-4 py-8">
        <h1 className="text-3xl font-semibold text-gray-800 mb-6">
          My Uploaded Resumes
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((resume) => (
            <div
              key={resume}
              className="w-72 h-40 bg-white border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center shadow-sm"
            >
              <span className="text-gray-400 text-lg">Resume {resume}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
