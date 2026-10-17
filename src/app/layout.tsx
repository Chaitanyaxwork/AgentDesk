import type { Metadata } from 'next'; import './globals.css'; import { Toaster } from 'sonner';
export const metadata:Metadata={title:'AgentDesk — AI Support, on autopilot',description:'Deploy an AI agent trained on your business in minutes.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}<Toaster theme="dark" position="bottom-right"/></body></html>}
