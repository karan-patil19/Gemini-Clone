// eslint-disable-next-line no-unused-vars
import React, { useContext, useState } from "react";
import "./Sidebar.css";
import { assets } from "../../assets/assets";
import { Context } from "../../context/Context";
const Sidebar = () => {
  const [extended, setExtended] = useState(false);
  const {onSent, prevPromts, setRecentPrompt,newChat} = useContext(Context);

  const loadPrompt =async(prompt)=>{
    setRecentPrompt(prompt)
    await onSent(prompt)
  }
  return (
    <div className="sidebar">
      <div className="top">
        <img
          onClick={() => setExtended(!extended)}
          className="menu"
          src={assets.menu_icon}
          alt=""
        ></img>
        <div onClick={()=>newChat()} className="new-chat">
          <img src={assets.plus_icon}></img>
          {extended ? <p>New Chat</p> : null}
        </div>
        {extended ?
          <div className="recent">
            <p className="recent-title">Recent</p>
            {prevPromts.map((item, index) => {
              return (
                <div onClick={()=>loadPrompt(item)} key={index} className="recent-entry">
                  <img src={assets.message_icon}></img>
                  <p>{item.slice(0,18)}... </p>
                </div>
              );
            })}
          </div>
        : null}
      </div>
      <div className="bottom">
        <div className="bottom-item recent-entry">
          <img src={assets.question_icon}></img>
          {extended ? <p>Help</p> : null}
        </div>
        <div className="bottom-item recent-entry">
          <img src={assets.history_icon}></img>
          {extended ? <p>Activity</p> : null}
        </div>
        <div className="bottom-item recent-entry">
          <img src={assets.setting_icon}></img>
          {extended ? <p>Setting</p> : null}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
