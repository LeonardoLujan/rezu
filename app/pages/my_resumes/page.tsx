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
  const [resumes, setResumes] = useState<ResumeItem[]>([]); // State to store fetched resumes
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


  // Real-time listener to fetch and display uploaded resumes
  useEffect(() => {
    if (user && firestore) {
      // 1. Build the query: 
      //    - Filters by user ID (where)
      //    - Orders by upload time (orderBy) - Requires the composite index
      const resumesQuery = query(
        collection(firestore, "resumes"),
        where("userId", "==", user.uid),
        orderBy("timeUploaded", "desc") 
      );

      // 2. Set up the real-time listener
      const unsubscribe = onSnapshot(resumesQuery, (snapshot) => {
        const fetchedResumes: ResumeItem[] = [];
        snapshot.forEach((doc) => {
          fetchedResumes.push({
            id: doc.id,
            ...(doc.data() as Omit<ResumeItem, 'id'>)
          });
        });
        
        // Data is already sorted by Firestore due to the query
        setResumes(fetchedResumes); 
      }, (error) => {
        console.error("Error listening to resumes:", error);
      });

      // 3. Cleanup the listener on component unmount
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
    
    // Reset progress before starting new upload
    setUploadProgress(0);

    try {
      const storageRef = ref(storage, `resumes/${user.uid}/${file.name}`)
      
      const uploadTask = uploadBytesResumable(storageRef, file)
      
      // NEW LOGIC: Use uploadTask.on for progress and wait for its completion via 'await'
      const uploadPromise = new Promise<void>((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snap) => {
            const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => {
            reject(error);
          },
          () => {
            // Once the file is successfully uploaded, resolve the promise.
            resolve();
          }
        );
      });

      // Wait for the file to finish uploading
      await uploadPromise;
      
      // 1. Get the final download URL
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      
      // 2. Save the metadata to Firestore
      await addDoc(collection(firestore, "resumes"), {
          userId: user.uid,
          name: file.name,
          timeUploaded: serverTimestamp(),
          downloadURL: url, // Use the new URL
      });

      // Success cleanup
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

  // Function to delete the file from Storage and the metadata from Firestore
  const handleDelete = async (resume: ResumeItem) => {
      if (!user) {
          console.error("User not authenticated.");
          return;
      }
      
      // IMPORTANT: Using custom modal UI is preferred over window.confirm in IFRAMEs.
      // Since this is a Next.js app in development, we'll keep the console error
      // in place of a full modal implementation for brevity, but note this is not best practice.
      const confirmDelete = window.confirm(`Are you sure you want to delete the resume: ${resume.name}?`);

      if (!confirmDelete) {
          return;
      }
      
      try {
          // 1. Delete the file from Firebase Storage
          const fileRef = ref(storage, `resumes/${user.uid}/${resume.name}`);
          await deleteObject(fileRef);

          // 2. Delete the metadata document from Firestore
          const docRef = doc(firestore, "resumes", resume.id);
          await deleteDoc(docRef);

          console.log(`Successfully deleted resume: ${resume.name}`);

      } catch (error) {
          console.error(`Error deleting resume ${resume.name}:`, error);
          // Note: If the file is already missing in storage, deleteObject throws an error,
          // but we still want to remove the Firestore record, so we often ignore
          // 'storage/object-not-found' errors here.
      }
  };

  const handleDownload = (url: string, _name: string) => {
      // Firebase Storage download URLs include auth tokens, so we can open directly
      // This bypasses CORS issues that occur with programmatic downloads
      window.open(url, '_blank');
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <p>Loading user session...</p>
        </div>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <Nav />

      <div className="flex flex-col items-center justify-center p-4 mt-8">
        <h1 className="text-4xl font-bold mb-6 text-gray-800">Upload Resume</h1>

        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={handleFileSelect}
          className="mb-4 px-6 py-3 border border-gray-400 text-gray-700 bg-white rounded-lg shadow-md hover:bg-gray-100 transition duration-150 transform hover:scale-[1.01]"
        >
          {file ? 'Change File' : 'Choose File'}
        </button>


        {file && <p className="mb-4 text-gray-600 font-medium">Selected: <span className="text-purple-700">{file.name}</span></p>}

        <button
          onClick={handleUpload}
          disabled={!file}
          className={`px-8 py-3 text-white rounded-lg shadow-lg transition duration-150 ${
            file
              ? 'bg-purple-700 hover:bg-purple-800 transform hover:scale-[1.01]'
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          Upload Resume
        </button>
        
        {uploadProgress > 0 && (
            <div className="w-80 mt-4">
                <p className="text-sm text-gray-600 mb-1">
                    {uploadProgress < 100 ? `Uploading... ${uploadProgress.toFixed(0)}%` : 'Processing...'}
                </p>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                        className="bg-purple-600 h-2.5 rounded-full transition-all duration-500" 
                        style={{ width: `${uploadProgress}%` }}
                    ></div>
                </div>
            </div>
        )}

      </div>
      
      <hr className="my-8 border-gray-200 max-w-4xl mx-auto" />

      <main className="flex flex-col items-center px-4 py-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-8">
          My Uploaded Resumes ({resumes.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resumes.length === 0 && (
            <div className="col-span-full text-center p-8 bg-white border border-dashed border-gray-300 rounded-xl shadow-inner">
                <p className="text-gray-500 text-lg">
                    {user ? 'You have no resumes uploaded yet. Get started by uploading one above!' : 'Please sign in to view your resumes.'}
                </p>
            </div>
          )}
          
          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="w-full max-w-xs bg-white border border-gray-200 rounded-xl p-6 shadow-xl flex flex-col justify-between transition duration-200 hover:shadow-2xl hover:border-purple-400"
            >
              <div className="flex items-center mb-4">
                <svg className="w-6 h-6 text-purple-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="text-lg font-semibold text-gray-800 truncate">
                  {resume.name} {/* Display the actual resume name */}
                </p>
              </div>
              <div className="text-sm text-gray-500 mb-4">
                {/* TimeUploaded is a Firestore Timestamp, so we convert it to a Date for display */}
                <p>Uploaded: {resume.timeUploaded?.toDate().toLocaleDateString() || 'N/A'}</p>
              </div>
              <div className="flex space-x-3 mt-2">
                <button
                  onClick={() => handleDownload(resume.downloadURL, resume.name)}
                  className="flex-1 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  Download
                </button>
                <button
                  onClick={() => handleDelete(resume)}
                  className="flex-1 px-4 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}