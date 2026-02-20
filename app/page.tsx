import Image from "next/image";
import LoginButton from '@/components/login/loginbutton'

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold mb-6">Welcome to Tezu</h1>
      <LoginButton />
    </div>
  )
}
