/* eslint-disable react/prop-types */
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import Message from "./Message";

export default function ChatView({ conversation }) {
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const { messages } = conversation;
  const last = messages[messages.length - 1];

  const scrollToBottom = (behavior = "auto") => {
    const el = scrollRef.current;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  // Jump to the newest message when opening a chat or sending a prompt.
  useLayoutEffect(() => {
    stickToBottom.current = true;
    scrollToBottom();
  }, [conversation.id, messages.length]);

  // Follow the streaming answer unless the user scrolled up to read.
  useLayoutEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [last?.text, last?.status]);

  const onScroll = () => {
    const el = scrollRef.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = near;
    setAtBottom(near);
  };

  return (
    <div className="chat-area">
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="thread">
          {messages.map((m, i) => (
            <Message key={m.id} message={m} isLast={i === messages.length - 1} />
          ))}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          className="scroll-down"
          aria-label="Scroll to latest"
          onClick={() => scrollToBottom("smooth")}
        >
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  );
}
