/* eslint-disable react/prop-types */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Mic, Plus, SendHorizontal, Square, X } from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useDismiss } from "../hooks";
import { MODELS } from "../lib/gemini";
import { imageSrc, readImage } from "../lib/images";
import { IconButton } from "./ui";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // before shrinking
const SpeechRecognition =
  typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function Composer({ autoFocus = false }) {
  const { send, stop, busy } = useChat();
  const [text, setText] = useState("");
  const [images, setImages] = useState([]);
  const [notice, setNotice] = useState("");
  const [listening, setListening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const canSend = !busy && (text.trim().length > 0 || images.length > 0);

  const submit = () => {
    if (!canSend) return;
    recognitionRef.current?.stop();
    send(text, images);
    setText("");
    setImages([]);
    setNotice("");
  };

  const addFiles = async (fileList) => {
    const files = [...fileList].filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return setNotice("Only image files can be attached.");
    const room = MAX_IMAGES - images.length;
    const tooBig = files.filter((f) => f.size > MAX_IMAGE_BYTES);
    const ok = files.filter((f) => f.size <= MAX_IMAGE_BYTES).slice(0, room);
    const loaded = await Promise.all(ok.map(readImage));
    setImages((prev) => [...prev, ...loaded].slice(0, MAX_IMAGES));
    if (tooBig.length) setNotice("Images must be 20 MB or smaller.");
    else if (files.length > room) setNotice(`You can attach up to ${MAX_IMAGES} images.`);
    else setNotice("");
    textareaRef.current?.focus();
  };

  const toggleMic = () => {
    if (listening) return recognitionRef.current?.stop();
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    const base = text.trim() ? `${text.trimEnd()} ` : "";
    rec.onresult = (e) =>
      setText(base + Array.from(e.results, (r) => r[0].transcript).join(""));
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setNotice("Microphone access is blocked for this site.");
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
    setNotice("");
  };

  return (
    <div className="composer-wrap">
      <form
        className={`composer ${dragging ? "dragging" : ""}`}
        onSubmit={(e) => (e.preventDefault(), submit())}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        {images.length > 0 && (
          <div className="attachments">
            {images.map((img, i) => (
              <div className="thumb" key={i}>
                <img src={imageSrc(img)} alt={img.name} />
                <button
                  type="button"
                  aria-label={`Remove ${img.name}`}
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={listening ? "Listening…" : "Ask Gemini"}
          aria-label="Message Gemini"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
        />

        <div className="composer-bar">
          <div className="composer-tools">
            <IconButton
              label="Add images"
              onClick={() => fileRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
            >
              <Plus size={20} />
            </IconButton>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <div className="composer-tools">
            <ModelPicker />
            {SpeechRecognition && (
              <IconButton
                label={listening ? "Stop listening" : "Use microphone"}
                className={listening ? "listening" : ""}
                onClick={toggleMic}
              >
                <Mic size={20} />
              </IconButton>
            )}
            {busy ? (
              <button type="button" className="send-btn stop" onClick={stop} aria-label="Stop response" title="Stop response">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button type="submit" className="send-btn" disabled={!canSend} aria-label="Send message" title="Send message">
                <SendHorizontal size={20} />
              </button>
            )}
          </div>
        </div>
      </form>
      {notice && <p className="composer-notice" role="status">{notice}</p>}
    </div>
  );
}

function ModelPicker() {
  const { model, setModel } = useChat();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  const current = MODELS.find((m) => m.id === model) ?? MODELS[0];

  return (
    <div className="model-picker" ref={ref}>
      <button
        type="button"
        className="model-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {current.label}
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu model-menu" role="menu">
          <p className="menu-heading">Choose your model</p>
          {MODELS.map((m) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={m.id === model}
              key={m.id}
              onClick={() => {
                setModel(m.id);
                setOpen(false);
              }}
            >
              <span className="model-option">
                <strong>{m.label}</strong>
                <span>{m.description}</span>
              </span>
              {m.id === model && <Check size={18} className="menu-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
