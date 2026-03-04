"use client"

import Nav from '@/components/nav/nav'
import { useRef, useState, useEffect } from 'react'
import { auth } from '@/lib/firebase'
import { useRouter } from 'next/navigation'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage"
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  orderBy,
  deleteDoc,
  doc,
} from "firebase/firestore"
import { storage, firestore } from "@/lib/firebase"
import Modal from '@/components/modal/Modal'
import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues with react-pdf
const ResumePreview = dynamic(() => import('@/components/resume/ResumePreview'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber"></div>
    </div>
  )
})


// Define a simple type for the resume documents retrieved from Firestore
interface ResumeItem {
  id: string;
  userId: string;
  name: string;
  downloadURL: string;
  timeUploaded: any; // Using 'any' for the Firestore Timestamp type for simplicity
}

export default function My_Resumes() {
  const [file, setFile] = useState<File | null>(null)
  const [user, setUser] = useState<any>(null)
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true)
  const [downloadURL, setDownloadURL] = useState("");
  const [resumes, setResumes] = useState<ResumeItem[]>([]);
  const [previewResume, setPreviewResume] = useState<ResumeItem | null>(null)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Auth protection
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        router.push('/')
      } else {
        setUser(currentUser)
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  // Real-time listener to fetch and display uploaded resumes
  useEffect(() => {
    if (user && firestore) {
      const resumesQuery = query(
        collection(firestore, "resumes"),
        where("userId", "==", user.uid),
        orderBy("timeUploaded", "desc")
      );

      const unsubscribe = onSnapshot(resumesQuery, (snapshot) => {
        const fetchedResumes: ResumeItem[] = [];
        snapshot.forEach((doc) => {
          fetchedResumes.push({
            id: doc.id,
            ...(doc.data() as Omit<ResumeItem, 'id'>)
          });
        });
        setResumes(fetchedResumes);
      }, (error) => {
        console.error("Error listening to resumes:", error);
      });

      return () => unsubscribe();
    }
  }, [user]);

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
  }

  const handleUpload = async () => {
    if (!file || !user) {
        console.error("Please select a file and ensure you are logged in.");
        return;
    }

    if (resumes.length >= 10) {
        setShowLimitModal(true)
        return
    }

    setUploadProgress(0);

    try {
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`)
      const uploadTask = uploadBytesResumable(storageRef, file)

      const uploadPromise = new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snap) => {
            const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => { reject(error); },
          () => { resolve(); }
        );
      });

      await uploadPromise;

      const url = await getDownloadURL(uploadTask.snapshot.ref);

      await addDoc(collection(firestore, "resumes"), {
          userId: user.uid,
          name: file.name,
          timeUploaded: serverTimestamp(),
          downloadURL: url,
      });

      console.log("Resume uploaded and metadata saved successfully!");
      setFile(null);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(0), 1000);
      setDownloadURL("");

    } catch (err) {
      console.error("Upload failed:", err)
      setUploadProgress(0);
    }
  }

  const handleDelete = async (resume: ResumeItem) => {
      if (!user) {
          console.error("User not authenticated.");
          return;
      }

      const confirmDelete = window.confirm(`Are you sure you want to delete the resume: ${resume.name}?`);
      if (!confirmDelete) return;

      try {
          const fileRef = ref(storage, `resumes/${user.uid}/${resume.name}`);
          try {
              await deleteObject(fileRef);
          } catch (storageError: any) {
              if (storageError?.code === 'storage/object-not-found') {
                  console.warn(`File not found in storage, removing orphaned Firestore record: ${resume.name}`);
              } else {
                  throw storageError;
              }
          }

          const docRef = doc(firestore, "resumes", resume.id);
          await deleteDoc(docRef);
          console.log(`Successfully deleted resume: ${resume.name}`);

      } catch (error) {
          console.error(`Error deleting resume ${resume.name}:`, error);
      }
  };

  const handleDownload = (url: string, _name: string) => {
      window.open(url, '_blank');
  };

  const handlePreview = (resume: ResumeItem) => {
      setPreviewResume(resume);
  };

  const handleClosePreview = () => {
      setPreviewResume(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-charcoal/50">Loading user session...</p>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <Nav />

      {/* Upload section */}
      <div className="flex flex-col items-center justify-center p-4 mt-10">
        <h1 className="text-4xl font-display font-semibold mb-6 text-charcoal tracking-tight">
          Upload Resume
        </h1>

        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={handleFileSelect}
          className="mb-4 px-6 py-3 border border-stone-300 text-charcoal bg-background rounded-lg hover:bg-stone-100 transition duration-150"
        >
          {file ? 'Change File' : 'Choose File'}
        </button>

        {file && (
          <p className="mb-4 text-charcoal/60 font-medium">
            Selected: <span className="text-amber font-semibold">{file.name}</span>
          </p>
        )}

        <button
          onClick={handleUpload}
          disabled={!file}
          className={`px-8 py-3 rounded-lg font-semibold transition duration-150 ${
            file
              ? 'bg-amber text-charcoal hover:bg-[#b8995e]'
              : 'bg-stone-300 text-stone-500 cursor-not-allowed'
          }`}
        >
          Upload Resume
        </button>

        {uploadProgress > 0 && (
          <div className="w-80 mt-4">
            <p className="text-sm text-charcoal/50 mb-1">
              {uploadProgress < 100 ? `Uploading... ${uploadProgress.toFixed(0)}%` : 'Processing...'}
            </p>
            <div className="w-full bg-stone-200 rounded-full h-1.5">
              <div
                className="bg-amber h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <hr className="my-10 border-stone-200 max-w-4xl mx-auto" />

      {/* Resume list */}
      <main className="flex flex-col items-center px-4 pb-16">
        <h2 className="text-3xl font-display font-semibold text-charcoal mb-8 tracking-tight">
          My Uploaded Resumes ({resumes.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resumes.length === 0 && (
            <div className="col-span-full text-center py-16 px-8">
              <p className="font-display text-2xl text-charcoal/30 mb-2">No resumes yet</p>
              <p className="text-sm text-charcoal/40">
                {user ? 'Upload one above to get started.' : 'Please sign in to view your resumes.'}
              </p>
            </div>
          )}

          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="w-full max-w-xs bg-[#f5f0e8] border border-stone-200 rounded-xl p-6 flex flex-col justify-between transition duration-200 hover:border-amber/50"
            >
              <div className="flex items-center mb-4">
                <svg
                  className="w-5 h-5 text-charcoal/40 mr-3 flex-shrink-0"
                  fill="none" stroke="currentColor" strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-base font-semibold text-charcoal truncate">
                  {resume.name}
                </p>
              </div>

              <div className="text-sm text-charcoal/50 mb-4">
                <p>Uploaded: {resume.timeUploaded?.toDate().toLocaleDateString() || 'N/A'}</p>
              </div>

              <div className="flex flex-col space-y-2 mt-2">
                {/* Primary action — amber signals this is the point of the tool */}
                <button
                  onClick={() => handlePreview(resume)}
                  className="w-full px-4 py-2.5 text-sm font-semibold bg-amber text-charcoal rounded-lg hover:bg-[#b8995e] transition"
                >
                  Preview & Critique
                </button>

                {/* Secondary row — Download as plain text link, Delete as icon only */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => handleDownload(resume.downloadURL, resume.name)}
                    className="text-sm text-charcoal/50 hover:text-charcoal transition"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(resume)}
                    aria-label="Delete resume"
                    title="Delete"
                    className="p-1.5 text-charcoal/30 hover:text-red-600 transition rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.021-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Resume Limit Modal */}
      <Modal isOpen={showLimitModal} onClose={() => setShowLimitModal(false)} maxWidth="sm">
        <div className="p-8 text-center">
          <p className="font-display text-lg font-semibold text-charcoal mb-2">
            Max amount of resumes stored
          </p>
          <p className="text-charcoal/60 mb-6">Delete one to continue.</p>
          <button
            onClick={() => setShowLimitModal(false)}
            className="px-6 py-2 bg-charcoal text-[#f5f0e8] rounded-lg hover:bg-charcoal/80 transition"
          >
            OK
          </button>
        </div>
      </Modal>

      {/* Resume Preview Modal */}
      <Modal
        isOpen={!!previewResume}
        onClose={handleClosePreview}
        maxWidth="full"
        showCloseButton={true}
      >
        {previewResume && (
          <ResumePreview
            downloadURL={previewResume.downloadURL}
            fileName={previewResume.name}
            onClose={handleClosePreview}
            onDownload={() => handleDownload(previewResume.downloadURL, previewResume.name)}
          />
        )}
      </Modal>
    </div>
  )
}
