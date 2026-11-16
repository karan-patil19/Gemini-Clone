import { useEffect, useState } from "react";
import { Menu, SquarePen } from "lucide-react";
import ChatView from "./components/ChatView";
import Composer from "./components/Composer";
import Home from "./components/Home";
import Sidebar from "./components/Sidebar";
import { IconButton } from "./components/ui";
import { useChat } from "./context/ChatContext";
import { useMediaQuery, useTheme } from "./hooks";
import userIcon from "./assets/user_icon.jpg";
import "./App.css";

export default function App() {
  const { activeConversation, newChat } = useChat();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [theme, setTheme] = useTheme();

  useEffect(() => setSidebarOpen(!isMobile), [isMobile]);

  // Ctrl/Cmd + Shift + O starts a new chat, like Gemini.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChat]);

  const hasMessages = activeConversation?.messages.length > 0;

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        isMobile={isMobile}
        onToggle={() => setSidebarOpen((v) => !v)}
        onClose={() => setSidebarOpen(false)}
        theme={theme}
        setTheme={setTheme}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            {isMobile && (
              <IconButton label="Open menu" onClick={() => setSidebarOpen(true)}>
                <Menu size={20} />
              </IconButton>
            )}
            <span className="brand">Gemini</span>
          </div>
          <div className="topbar-right">
            {isMobile && hasMessages && (
              <IconButton label="New chat" onClick={newChat}>
                <SquarePen size={20} />
              </IconButton>
            )}
            <img className="avatar" src={userIcon} alt="Your profile" />
          </div>
        </header>

        {hasMessages ? (
          <>
            <ChatView conversation={activeConversation} />
            <div className="dock">
              <Composer key={activeConversation.id} autoFocus={!isMobile} />
              <p className="disclaimer">Gemini can make mistakes, so double-check it</p>
            </div>
          </>
        ) : (
          <Home autoFocus={!isMobile} />
        )}
      </main>
    </div>
  );
}
