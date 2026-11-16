/* eslint-disable react/prop-types */
import { Code, GraduationCap, Lightbulb, PenLine, Plane } from "lucide-react";
import { useChat } from "../context/ChatContext";
import Composer from "./Composer";
import { Spark } from "./ui";

const USER_NAME = import.meta.env.VITE_USER_NAME || "Karan";

const SUGGESTIONS = [
  { Icon: Plane, label: "Plan a trip", prompt: "Plan a 3-day road trip with beautiful places to see along the way" },
  { Icon: Lightbulb, label: "Explain a concept", prompt: "Explain urban planning in simple terms, with real-world examples" },
  { Icon: Code, label: "Help me code", prompt: "Write a React hook that debounces a value, and explain how it works" },
  { Icon: PenLine, label: "Help me write", prompt: "Brainstorm 8 fun team-bonding activities for our work retreat" },
  { Icon: GraduationCap, label: "Quiz me", prompt: "Give me a 5-question multiple-choice quiz on world geography, one question at a time" },
];

export default function Home({ autoFocus }) {
  const { send, busy } = useChat();
  return (
    <div className="home">
      <div className="home-inner">
        <div className="greeting">
          <p className="greeting-hi">
            <Spark size={22} />
            <span className="gradient-text">Hi {USER_NAME}</span>
          </p>
          <h1>Where should we start?</h1>
        </div>
        <Composer autoFocus={autoFocus} />
        <div className="chips">
          {SUGGESTIONS.map(({ Icon, label, prompt }) => (
            <button type="button" key={label} className="chip" disabled={busy} onClick={() => send(prompt)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
