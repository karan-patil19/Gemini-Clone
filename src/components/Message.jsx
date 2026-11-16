/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ImageOff,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useCopy } from "../hooks";
import { MODELS, modelName } from "../lib/gemini";
import { imageSrc } from "../lib/images";
import Markdown from "./Markdown";
import { IconButton, Spark } from "./ui";

export default function Message({ message, isLast }) {
  return message.role === "user" ? (
    <UserMessage message={message} />
  ) : (
    <ModelMessage message={message} isLast={isLast} />
  );
}


function UserMessage({ message }) {
  const { busy, editMessage } = useChat();
  const [copied, copy] = useCopy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);

  if (editing) {
    return (
      <div className="msg user editing">
        <form
          className="edit-box"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            editMessage(message.id, draft);
          }}
        >
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form.requestSubmit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Edit your message"
          />
          <div className="edit-actions">
            <button type="button" className="text-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="pill-btn" disabled={!draft.trim()}>
              Update
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="msg user">
      <div className="user-actions">
        {message.text && (
          <IconButton label={copied ? "Copied" : "Copy prompt"} onClick={() => copy(message.text)}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </IconButton>
        )}
        <IconButton
          label="Edit prompt"
          disabled={busy}
          onClick={() => {
            setDraft(message.text);
            setEditing(true);
          }}
        >
          <Pencil size={16} />
        </IconButton>
      </div>
      <div className="user-content">
        {message.images?.length > 0 && (
          <div className="msg-images">
            {message.images.map((img, i) =>
              img.data ? (
                <img key={i} src={imageSrc(img)} alt={img.name || "Attached image"} />
              ) : (
                <div key={i} className="img-missing" title="Image wasn't saved (browser storage full)">
                  <ImageOff size={20} />
                </div>
              )
            )}
          </div>
        )}
        {message.text && <div className="bubble">{message.text}</div>}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="thinking" aria-label="Gemini is thinking">
      <span />
      <span />
      <span />
    </div>
  );
}

/** Plain text for read-aloud: drop code blocks and markdown symbols. */
const speakable = (md) =>
  md
    .replace(/```[\s\S]*?```/g, " (code) ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>|~-]+/g, " ");

function ModelMessage({ message, isLast }) {
  const { busy, regenerate, setFeedback } = useChat();
  const [copied, copy] = useCopy();
  const [speaking, setSpeaking] = useState(false);
  const streaming = message.status === "streaming";

  useEffect(() => () => speaking && window.speechSynthesis?.cancel(), [speaking]);

  const toggleSpeak = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (speaking) return setSpeaking(false);
    const u = new SpeechSynthesisUtterance(speakable(message.text));
    u.onend = u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  const fellBack = message.model && message.requestedModel && message.model !== message.requestedModel;
  const requested = MODELS.find((m) => m.id === message.requestedModel);

  return (
    <div className="msg model">
      <div className={`model-avatar ${streaming ? "busy" : ""}`}>
        <Spark size={24} />
      </div>
      <div className="model-body">
        {streaming && !message.text ? (
          <>
            <Thinking />
            {message.trying && (
              <p className="msg-note">Gemini is busy, so trying {modelName(message.trying)}…</p>
            )}
          </>
        ) : (
          message.text && <Markdown text={message.text} />
        )}

        {message.status === "stopped" && <p className="msg-note">You stopped this response</p>}

        {message.status === "error" && (
          <div className="error-card" role="alert">
            <TriangleAlert size={20} />
            <div>
              <p>{message.error}</p>
              {isLast && (
                <button type="button" className="pill-btn" disabled={busy} onClick={() => regenerate(message.id)}>
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {!streaming && message.status !== "error" && message.text && (
          <div className="msg-actions">
            <IconButton
              label="Good response"
              className={message.feedback === "up" ? "active" : ""}
              onClick={() => setFeedback(message.id, message.feedback === "up" ? null : "up")}
            >
              <ThumbsUp size={16} />
            </IconButton>
            <IconButton
              label="Bad response"
              className={message.feedback === "down" ? "active" : ""}
              onClick={() => setFeedback(message.id, message.feedback === "down" ? null : "down")}
            >
              <ThumbsDown size={16} />
            </IconButton>
            {isLast && (
              <IconButton label="Redo" disabled={busy} onClick={() => regenerate(message.id)}>
                <RotateCcw size={16} />
              </IconButton>
            )}
            <IconButton label={copied ? "Copied" : "Copy response"} onClick={() => copy(message.text)}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconButton>
            {"speechSynthesis" in window && (
              <IconButton label={speaking ? "Stop reading" : "Read aloud"} onClick={toggleSpeak}>
                {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </IconButton>
            )}
            {message.model && (
              <span
                className="model-tag"
                title={fellBack ? `${requested?.name ?? message.requestedModel} was busy, so a backup model answered` : undefined}
              >
                {modelName(message.model)}
                {fellBack && ` · ${requested?.label ?? "selected model"} was busy`}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
