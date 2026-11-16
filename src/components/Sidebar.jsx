/* eslint-disable react/prop-types */
import { useMemo, useRef, useState } from "react";
import {
  Check,
  EllipsisVertical,
  Menu,
  Monitor,
  Moon,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  SquarePen,
  Sun,
  Trash2,
} from "lucide-react";
import { useChat } from "../context/ChatContext";
import { useDismiss } from "../hooks";
import { IconButton } from "./ui";

export default function Sidebar({ open, isMobile, onToggle, onClose, theme, setTheme }) {
  const { conversations, activeId, newChat, selectChat } = useChat();
  const [query, setQuery] = useState("");

  const { pinned, recent } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = conversations
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return { pinned: list.filter((c) => c.pinned), recent: list.filter((c) => !c.pinned) };
  }, [conversations, query]);

  const then = (fn) => () => {
    fn();
    if (isMobile) onClose();
  };

  return (
    <>
      {isMobile && open && <div className="backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Chat history">
        <div className="sidebar-top">
          <IconButton label={open ? "Collapse menu" : "Expand menu"} onClick={onToggle}>
            <Menu size={20} />
          </IconButton>
        </div>

        <button type="button" className="nav-btn new-chat" onClick={then(newChat)} title="New chat">
          <SquarePen size={20} />
          <span className="label">New chat</span>
        </button>

        <div className="history">
          {open && (
            <>
              <label className="search">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chats"
                  aria-label="Search chats"
                />
              </label>

              {pinned.length > 0 && (
                <Section title="Pinned">
                  {pinned.map((c) => (
                    <ChatItem key={c.id} conv={c} active={c.id === activeId} onSelect={then(() => selectChat(c.id))} />
                  ))}
                </Section>
              )}

              <Section title="Recent">
                {recent.map((c) => (
                  <ChatItem key={c.id} conv={c} active={c.id === activeId} onSelect={then(() => selectChat(c.id))} />
                ))}
                {recent.length === 0 && (
                  <p className="history-empty">
                    {query ? "No chats match your search" : "Your chats will show up here"}
                  </p>
                )}
              </Section>
            </>
          )}
        </div>

        <SettingsMenu open={open} theme={theme} setTheme={setTheme} />
      </aside>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="history-section">
      <p className="history-title">{title}</p>
      {children}
    </div>
  );
}

function ChatItem({ conv, active, onSelect }) {
  const { deleteChat, renameChat, togglePin } = useChat();
  const [menuPos, setMenuPos] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const ref = useRef(null);

  const closeMenu = () => {
    setMenuPos(null);
    setConfirmDelete(false);
  };
  useDismiss(ref, Boolean(menuPos), closeMenu);

  const openMenu = (e) => {
    if (menuPos) return closeMenu();
    const r = e.currentTarget.getBoundingClientRect();
    const height = 140;
    const top = r.bottom + height > window.innerHeight ? r.top - height : r.bottom + 4;
    setMenuPos({ top, left: Math.max(8, r.right - 200) });
  };

  const commitRename = () => {
    const t = draft.trim();
    if (t) renameChat(conv.id, t);
    else setDraft(conv.title);
    setEditing(false);
  };

  if (editing) {
    return (
      <form className="chat-item editing" onSubmit={(e) => (e.preventDefault(), commitRename())}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(conv.title);
              setEditing(false);
            }
          }}
          aria-label="Chat name"
        />
      </form>
    );
  }

  return (
    <div ref={ref} className={`chat-item ${active ? "active" : ""} ${menuPos ? "menu-open" : ""}`}>
      <button type="button" className="chat-item-main" onClick={onSelect} title={conv.title}>
        {conv.pinned && <Pin size={14} className="pin-icon" />}
        <span>{conv.title}</span>
      </button>
      <IconButton label="Chat options" className="chat-item-more" onClick={openMenu}>
        <EllipsisVertical size={16} />
      </IconButton>

      {menuPos && (
        <div className="menu fixed" style={menuPos} role="menu">
          <button type="button" role="menuitem" onClick={() => (togglePin(conv.id), closeMenu())}>
            {conv.pinned ? <PinOff size={18} /> : <Pin size={18} />}
            {conv.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              setDraft(conv.title);
              setEditing(true);
            }}
          >
            <Pencil size={18} /> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => (confirmDelete ? deleteChat(conv.id) : setConfirmDelete(true))}
          >
            <Trash2 size={18} /> {confirmDelete ? "Click again to delete" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

const THEMES = [
  { id: "system", label: "System", Icon: Monitor },
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
];

function SettingsMenu({ open, theme, setTheme }) {
  const { conversations, clearAll } = useChat();
  const [show, setShow] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const ref = useRef(null);
  const close = () => {
    setShow(false);
    setConfirmClear(false);
  };
  useDismiss(ref, show, close);

  return (
    <div className="sidebar-bottom" ref={ref}>
      {show && (
        <div className={`menu settings-menu ${open ? "" : "from-rail"}`} role="menu">
          <p className="menu-heading">Theme</p>
          {THEMES.map(({ id, label, Icon }) => (
            <button type="button" role="menuitemradio" aria-checked={theme === id} key={id} onClick={() => setTheme(id)}>
              <Icon size={18} /> {label}
              {theme === id && <Check size={18} className="menu-check" />}
            </button>
          ))}
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={conversations.length === 0}
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true);
              clearAll();
              close();
            }}
          >
            <Trash2 size={18} /> {confirmClear ? "Click again to confirm" : "Delete all chats"}
          </button>
        </div>
      )}
      <button
        type="button"
        className="nav-btn"
        onClick={() => (show ? close() : setShow(true))}
        title="Settings"
        aria-expanded={show}
      >
        <Settings size={20} />
        <span className="label">Settings</span>
      </button>
    </div>
  );
}
