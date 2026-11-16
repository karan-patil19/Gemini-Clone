/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_MODEL,
  MODELS,
  friendlyError,
  generateTitle,
  streamChat,
} from "../lib/gemini";

const STORAGE_KEY = "gemini-clone:chats:v2";

const ChatContext = createContext(null);
export const useChat = () => useContext(ChatContext);

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/* ---------- persistence ---------- */

function loadState() {
  const empty = { conversations: [], activeId: null, model: DEFAULT_MODEL };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.conversations)) return empty;
    return {
      activeId: null,
      model: MODELS.some((m) => m.id === saved.model) ? saved.model : DEFAULT_MODEL,
      // A reply that was streaming when the tab closed can't resume.
      conversations: saved.conversations.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.status === "streaming" ? { ...m, status: "stopped" } : m
        ),
      })),
    };
  } catch {
    return empty;
  }
}

function saveState(state) {
  const data = { model: state.model, conversations: state.conversations };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage is full (usually because of images): keep the chats, drop image data.
    try {
      const slim = data.conversations.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.images?.length
            ? { ...m, images: m.images.map(({ mimeType, name }) => ({ mimeType, name })) }
            : m
        ),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, conversations: slim }));
    } catch {
      /* give up silently; the chat still works in memory */
    }
  }
}

/* ---------- reducer ---------- */

const updateConv = (state, id, fn) => ({
  ...state,
  conversations: state.conversations.map((c) => (c.id === id ? fn(c) : c)),
});

const updateMsg = (conv, msgId, fn) => ({
  ...conv,
  messages: conv.messages.map((m) => (m.id === msgId ? fn(m) : m)),
});

function reducer(state, a) {
  switch (a.type) {
    case "NEW_CHAT":
      return { ...state, activeId: null };
    case "SELECT":
      return { ...state, activeId: a.id };
    case "SET_MODEL":
      return { ...state, model: a.model };
    case "CREATE":
      return {
        ...state,
        activeId: a.conv.id,
        conversations: [a.conv, ...state.conversations],
      };
    case "DELETE":
      return {
        ...state,
        conversations: state.conversations.filter((c) => c.id !== a.id),
        activeId: state.activeId === a.id ? null : state.activeId,
      };
    case "CLEAR_ALL":
      return { ...state, conversations: [], activeId: null };
    case "RENAME":
      return updateConv(state, a.id, (c) => ({ ...c, title: a.title }));
    case "TOGGLE_PIN":
      return updateConv(state, a.id, (c) => ({ ...c, pinned: !c.pinned }));
    case "PUSH":
      return updateConv(state, a.id, (c) => ({
        ...c,
        messages: [...c.messages, ...a.messages],
        updatedAt: Date.now(),
      }));
    case "TRUNCATE":
      return updateConv(state, a.id, (c) => {
        const i = c.messages.findIndex((m) => m.id === a.fromId);
        return i < 0 ? c : { ...c, messages: c.messages.slice(0, i) };
      });
    case "APPEND":
      return updateConv(state, a.id, (c) =>
        updateMsg(c, a.msgId, (m) => ({ ...m, text: m.text + a.text }))
      );
    case "PATCH":
      return updateConv(state, a.id, (c) =>
        updateMsg(c, a.msgId, (m) => ({ ...m, ...a.patch }))
      );
    default:
      return state;
  }
}

const newModelMessage = () => ({
  id: uid(),
  role: "model",
  text: "",
  status: "streaming",
  createdAt: Date.now(),
});

/* ---------- provider ---------- */

// eslint-disable-next-line react/prop-types
export function ChatProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => saveState(state), 400);
    return () => clearTimeout(t);
  }, [state]);

  const findConv = (id) => stateRef.current.conversations.find((c) => c.id === id);

  const runGeneration = useCallback(async (convId, history, modelMsgId) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    const requestedModel = stateRef.current.model;
    try {
      const result = await streamChat({
        model: requestedModel,
        messages: history,
        signal: controller.signal,
        onText: (text) =>
          dispatch({ type: "APPEND", id: convId, msgId: modelMsgId, text }),
        onFallback: (fallbackModel) =>
          dispatch({ type: "PATCH", id: convId, msgId: modelMsgId, patch: { trying: fallbackModel } }),
      });
      dispatch({
        type: "PATCH",
        id: convId,
        msgId: modelMsgId,
        patch: {
          status: result.aborted ? "stopped" : "done",
          model: result.model,
          requestedModel,
        },
      });
    } catch (err) {
      console.error(err);
      dispatch({
        type: "PATCH",
        id: convId,
        msgId: modelMsgId,
        patch: { status: "error", error: friendlyError(err) },
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }, []);

  const send = useCallback(
    async (text, images = []) => {
      const prompt = text.trim();
      if ((!prompt && images.length === 0) || abortRef.current) return;

      let convId = stateRef.current.activeId;
      const existing = convId && findConv(convId);
      if (!existing) {
        convId = uid();
        dispatch({
          type: "CREATE",
          conv: {
            id: convId,
            title: prompt.slice(0, 48) || "Image chat",
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
          },
        });
        generateTitle(prompt || "Describe an image").then(
          (title) => title && dispatch({ type: "RENAME", id: convId, title })
        );
      }

      const userMsg = { id: uid(), role: "user", text: prompt, images, createdAt: Date.now() };
      const modelMsg = newModelMessage();
      dispatch({ type: "PUSH", id: convId, messages: [userMsg, modelMsg] });
      await runGeneration(convId, [...(existing?.messages ?? []), userMsg], modelMsg.id);
    },
    [runGeneration]
  );

  const regenerate = useCallback(
    async (modelMsgId) => {
      if (abortRef.current) return;
      const conv = findConv(stateRef.current.activeId);
      const i = conv?.messages.findIndex((m) => m.id === modelMsgId) ?? -1;
      if (i < 0) return;
      const modelMsg = newModelMessage();
      dispatch({ type: "TRUNCATE", id: conv.id, fromId: modelMsgId });
      dispatch({ type: "PUSH", id: conv.id, messages: [modelMsg] });
      await runGeneration(conv.id, conv.messages.slice(0, i), modelMsg.id);
    },
    [runGeneration]
  );

  const editMessage = useCallback(
    async (userMsgId, newText) => {
      const prompt = newText.trim();
      if (abortRef.current || !prompt) return;
      const conv = findConv(stateRef.current.activeId);
      const i = conv?.messages.findIndex((m) => m.id === userMsgId) ?? -1;
      if (i < 0) return;
      const userMsg = { ...conv.messages[i], id: uid(), text: prompt, createdAt: Date.now() };
      const modelMsg = newModelMessage();
      dispatch({ type: "TRUNCATE", id: conv.id, fromId: userMsgId });
      dispatch({ type: "PUSH", id: conv.id, messages: [userMsg, modelMsg] });
      await runGeneration(conv.id, [...conv.messages.slice(0, i), userMsg], modelMsg.id);
    },
    [runGeneration]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const value = useMemo(() => {
    const activeConversation =
      state.conversations.find((c) => c.id === state.activeId) ?? null;
    return {
      ...state,
      activeConversation,
      busy,
      send,
      stop,
      regenerate,
      editMessage,
      newChat: () => dispatch({ type: "NEW_CHAT" }),
      selectChat: (id) => dispatch({ type: "SELECT", id }),
      renameChat: (id, title) => dispatch({ type: "RENAME", id, title }),
      togglePin: (id) => dispatch({ type: "TOGGLE_PIN", id }),
      setModel: (model) => dispatch({ type: "SET_MODEL", model }),
      deleteChat: (id) => {
        if (id === state.activeId) abortRef.current?.abort();
        dispatch({ type: "DELETE", id });
      },
      clearAll: () => {
        abortRef.current?.abort();
        dispatch({ type: "CLEAR_ALL" });
      },
      setFeedback: (msgId, feedback) =>
        dispatch({ type: "PATCH", id: state.activeId, msgId, patch: { feedback } }),
    };
  }, [state, busy, send, stop, regenerate, editMessage]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
