import React from "react";
import useDialog from "../../hooks/useDialog";

export default function NavigationDrawer({ onClose, children }) {
  const ref = useDialog(onClose);
  return (
    <div
      className="navigation-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Browse Alto"
        tabIndex={-1}
        className="navigation-drawer"
      >
        {children}
      </div>
    </div>
  );
}
