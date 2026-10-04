import React from "react";
import Brand from "./Brand";

export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Alto could not render this view:", error);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery-page">
          <Brand />
          <h1>Let’s take that again.</h1>
          <p>
            Something interrupted this view. Your saved drafts are still on this
            device.
          </p>
          <button
            className="alto-button"
            onClick={() => window.location.reload()}
          >
            Reload Alto
          </button>
        </main>
      );
    return this.props.children;
  }
}
