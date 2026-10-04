import React from "react";

export function AltoMark({ className = "" }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 29 17 7h7L12 29H5Z" fill="currentColor" />
      <path
        d="m21 16 13 13H20l-6 7h21a3 3 0 0 0 2-5L24 10l-3 6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Brand() {
  return (
    <span className="alto-brand">
      <AltoMark />
      <span>
        alto<span className="brand-period">.</span>
      </span>
    </span>
  );
}
