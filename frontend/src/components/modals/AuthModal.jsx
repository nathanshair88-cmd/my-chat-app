import React, { useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Headphones,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Brand from "../Brand";

export default function AuthModal() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("/avatars/willow.svg");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister)
        await register(username.trim(), email.trim(), password, avatarUrl);
      else await login(email.trim(), password);
    } catch (err) {
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : !err.response
            ? "We couldn’t connect right now. Check your connection and try again."
            : "Something went wrong. Please check your details and try again.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="feature-pill">
            <span /> LESS NOISE. MORE TOGETHER.
          </span>
          <h1>
            Your people.
            <br />
            Your place.
            <br />
            <em>Your wavelength.</em>
          </h1>
          <p>
            For the big ideas, the small moments,
            <br />
            and the conversations that go somewhere.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div className="auth-art-orbit" />
            <div className="auth-art-orbit second" />
            <div className="auth-art-core">
              a<span>✳</span>
            </div>
            <span className="art-label auth-art-chat">
              <MessageCircle size={19} /> a place to belong
            </span>
            <span className="art-label auth-art-voice">
              <Headphones size={18} /> better together
            </span>
            <Sparkles className="auth-spark" size={35} />
          </div>
        </div>
        <footer>
          <span>MAKE YOURSELF AT HOME.</span>
          <ArrowUpRight size={20} />
        </footer>
      </section>
      <section className="auth-form-side">
        <div className="auth-topline">
          <span>
            {isRegister
              ? "Already part of the conversation?"
              : "New around here?"}
          </span>
          <button
            onClick={() => {
              setIsRegister((v) => !v);
              setError("");
            }}
          >
            {isRegister ? "Sign in" : "Join Alto"} <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">
            {isRegister
              ? "FIND YOUR KIND OF TOGETHER"
              : "PICK UP WHERE YOU LEFT OFF"}
          </span>
          <h2>
            {isRegister ? "Make yourself at home." : "Good to have you back."}
          </h2>
          <p>
            {isRegister
              ? "A fresh space for you and your favourite people."
              : "Your spaces, your friends, your next great conversation."}
          </p>
          {error && (
            <div className="auth-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
          <form onSubmit={submit}>
            {isRegister && (
              <>
                <label htmlFor="auth-username">What should we call you?</label>
                <input
                  id="auth-username"
                  autoComplete="nickname"
                  required
                  maxLength={50}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your name"
                />
                <label>
                  Pick your first look{" "}
                  <span className="optional-label">optional</span>
                </label>
                <div className="avatar-presets">
                  {["Willow", "Cleo", "Milo", "Sage", "Nova"].map((seed) => {
                    const url = `/avatars/${seed.toLowerCase()}.svg`;
                    return (
                      <button
                        type="button"
                        key={seed}
                        aria-label={`${seed} avatar`}
                        aria-pressed={avatarUrl === url}
                        className={avatarUrl === url ? "selected" : ""}
                        onClick={() => setAvatarUrl(url)}
                      >
                        <img src={url} alt="" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <label htmlFor="auth-password">Password</label>
            <div className="password-field">
              <input
                id="auth-password"
                type={visible ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                minLength={isRegister ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  isRegister ? "At least 8 characters" : "Your password"
                }
              />
              <button
                type="button"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <button
              className="alto-button auth-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? "One moment…"
                : isRegister
                  ? "Create your account"
                  : "Let’s go"}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>
          <div className="auth-footnote">
            <span /> A little more human. A lot more connected.
          </div>
        </div>
        <footer className="auth-form-footer">
          <span>ALTO — A SPACE FOR YOUR PEOPLE</span>
          <span>✳</span>
        </footer>
      </section>
    </main>
  );
}
