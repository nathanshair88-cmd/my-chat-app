import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Link,
  X,
  SkipForward,
  ShieldOff,
  TvMinimalPlay,
  Tv2,
  Users,
  Clock,
  Maximize2,
  Minimize2,
  ListVideo,
} from 'lucide-react';
import { watchTogetherService } from '../../services/watchTogetherService';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let _ytApiReady = false;
let _ytApiCallbacks = [];

function loadYTApi() {
  if (_ytApiReady) return Promise.resolve();
  if (window.YT && window.YT.Player) {
    _ytApiReady = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    _ytApiCallbacks.push(resolve);
    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => {
        _ytApiReady = true;
        _ytApiCallbacks.forEach((cb) => cb());
        _ytApiCallbacks = [];
      };
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// SponsorBlock integration
// ──────────────────────────────────────────────────────────────────────────────

async function fetchSponsorSegments(videoId) {
  try {
    const res = await fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=["sponsor","selfpromo","interaction","intro","outro","preview","filler"]`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((seg) => ({ start: seg.segment[0], end: seg.segment[1], category: seg.category }));
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Ad-blocker — MutationObserver approach on the iframe document
// ──────────────────────────────────────────────────────────────────────────────

function trySkipAd(iframeRef) {
  try {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    // Method 1: click the skip button if visible
    const skipBtn =
      doc.querySelector('.ytp-skip-ad-button') ||
      doc.querySelector('.ytp-ad-skip-button') ||
      doc.querySelector('[class*="skip-button"]');
    if (skipBtn) {
      skipBtn.click();
      return;
    }

    // Method 2: seek past the ad by setting currentTime on the video element
    const video = doc.querySelector('video');
    if (video && video.duration && !isNaN(video.duration)) {
      const adContainer =
        doc.querySelector('.ytp-ad-overlay-container') ||
        doc.querySelector('.video-ads') ||
        doc.querySelector('.ytp-ad-player-overlay');
      if (adContainer) {
        video.currentTime = video.duration;
      }
    }
  } catch (e) {
    // Cross-origin frames will throw — swallow silently
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main WatchTogetherPlayer component
// ──────────────────────────────────────────────────────────────────────────────

export default function WatchTogetherPlayer({ channelId, onClose }) {
  const [watchState, setWatchState] = useState(watchTogetherService.getCurrentState());
  const [urlInput, setUrlInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liveTime, setLiveTime] = useState(0);
  const [sponsorSegments, setSponsorSegments] = useState([]);
  const [adSkipActive, setAdSkipActive] = useState(false);
  const [sponsorSkipActive, setSponsorSkipActive] = useState(false);
  const [adSkipEnabled, setAdSkipEnabled] = useState(true);
  const [sponsorBlockEnabled, setSponsorBlockEnabled] = useState(true);
  const [notification, setNotification] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControlsInFullscreen, setShowControlsInFullscreen] = useState(true);
  const [showQueue, setShowQueue] = useState(false);

  const playerRef = useRef(null);       // YT.Player instance
  const iframeContainerRef = useRef(null); // div to mount player in
  const iframeRef = useRef(null);       // actual <iframe> element
  const watchPanelRef = useRef(null);   // outer panel div — target for fullscreen
  const adObserverRef = useRef(null);
  const sponsorPollRef = useRef(null);
  const liveTimeRef = useRef(null);
  const ignoreRemoteRef = useRef(false);
  const currentVideoIdRef = useRef(null);
  const channelIdRef = useRef(channelId);
  const scrubbingRef = useRef(false);
  const hideControlsTimerRef = useRef(null);

  // Keep channelIdRef in sync
  useEffect(() => { channelIdRef.current = channelId; }, [channelId]);
  // Keep scrubbingRef in sync
  useEffect(() => { scrubbingRef.current = scrubbing; }, [scrubbing]);

  // ── Subscribe to service state ─────────────────────────────────────────────

  useEffect(() => {
    const unsub = watchTogetherService.subscribe(setWatchState);
    return unsub;
  }, []);

  // ── Show notification helper ────────────────────────────────────────────────

  const showNotification = useCallback((msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // ── Load YouTube IFrame API ────────────────────────────────────────────────

  useEffect(() => {
    loadYTApi();
  }, []);

  // ── Create/recreate player when videoId changes ────────────────────────────

  useEffect(() => {
    const videoId = watchState.videoId;
    if (!videoId) return;
    if (currentVideoIdRef.current === videoId && playerRef.current) return;
    currentVideoIdRef.current = videoId;

    loadYTApi().then(() => {
      // Destroy existing player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }

      // Clear container
      if (iframeContainerRef.current) {
        iframeContainerRef.current.innerHTML = '';
      }

      const divId = `yt-player-${channelId}`;
      const div = document.createElement('div');
      div.id = divId;
      iframeContainerRef.current.appendChild(div);

      // eslint-disable-next-line no-undef
      const player = new YT.Player(divId, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: watchState.isPlaying ? 1 : 0,
          controls: 1,       // Use native controls for quality/captions
          disablekb: 0,      // Allow keyboard shortcuts
          fs: 0,             // Hide native fullscreen (we use custom fullscreen)
          iv_load_policy: 3, // Disable video annotations
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            playerRef.current = e.target;
            // Capture iframe ref for ad-blocking
            iframeRef.current = iframeContainerRef.current?.querySelector('iframe');
            e.target.setVolume(volume);
            if (watchState.currentTime > 0) {
              e.target.seekTo(watchState.currentTime, true);
            }
            if (watchState.isPlaying) {
              e.target.playVideo();
            }
            setDuration(e.target.getDuration());
            loadSponsorBlock(videoId);
            startAdObserver();
            startLiveTimePoll();
          },
          onStateChange: (e) => {
            // eslint-disable-next-line no-undef
            const YTState = YT.PlayerState;
            if (e.data === YTState.PLAYING) {
              setDuration(e.target.getDuration());
              // Broadcast to peers ONLY if this wasn't triggered by a remote sync command
              if (!ignoreRemoteRef.current) {
                const t = e.target.getCurrentTime();
                watchTogetherService.play(channelIdRef.current, t);
              }
            } else if (e.data === YTState.PAUSED) {
              // Broadcast pause to peers if user-initiated (not a remote command)
              if (!ignoreRemoteRef.current) {
                const t = e.target.getCurrentTime();
                watchTogetherService.pause(channelIdRef.current, t);
              }
            } else if (e.data === YTState.ENDED) {
              // When the video ends, the host (or anyone really) can trigger next.
              // To prevent multiple emits, we'll just let the backend handle popping.
              // Actually, simplest is just emit playNext.
              if (!ignoreRemoteRef.current) {
                watchTogetherService.playNext(channelIdRef.current);
              }
            }
          },
          onError: () => {
            showNotification('⚠️ Failed to load video. Check the URL or try another.');
          }
        }
      });
    });

    return () => {
      stopSponsorPoll();
      stopLiveTimePoll();
      stopAdObserver();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchState.videoId]);

  // ── Register remote control callbacks on the service ──────────────────────
  // Run ONCE on mount. Uses refs for playerRef/ignoreRemoteRef so no stale closures.

  useEffect(() => {
    watchTogetherService.setPlayerCallbacks({
      onPlay: (t) => {
        ignoreRemoteRef.current = true;
        playerRef.current?.seekTo(t, true);
        playerRef.current?.playVideo();
        setTimeout(() => { ignoreRemoteRef.current = false; }, 1500);
      },
      onPause: (t) => {
        ignoreRemoteRef.current = true;
        playerRef.current?.seekTo(t, true);
        playerRef.current?.pauseVideo();
        setTimeout(() => { ignoreRemoteRef.current = false; }, 1500);
      },
      onSeek: (t) => {
        ignoreRemoteRef.current = true;
        playerRef.current?.seekTo(t, true);
        setTimeout(() => { ignoreRemoteRef.current = false; }, 1500);
      },
    });
    return () => watchTogetherService.clearPlayerCallbacks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Show notification when remote activity changes ────────────────────────

  const prevLastActivity = useRef(null);
  useEffect(() => {
    if (watchState.lastActivity && watchState.lastActivity !== prevLastActivity.current) {
      prevLastActivity.current = watchState.lastActivity;
      showNotification(watchState.lastActivity);
    }
  }, [watchState.lastActivity, showNotification]);

  // ── Volume control ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume);
    }
  }, [volume, isMuted]);

  // ── Live time poll (updates scrub bar) ────────────────────────────────────

  const startLiveTimePoll = () => {
    stopLiveTimePoll();
    let prevPollTime = -1;
    liveTimeRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        const t = playerRef.current.getCurrentTime() || 0;
        setLiveTime(t);
        if (!scrubbingRef.current) setScrubValue(t);

        // Detect manual seek: a jump > 3s that wasn't caused by a remote command
        // (e.g. user drags YouTube's native progress bar if it ever shows)
        if (
          prevPollTime >= 0 &&
          !ignoreRemoteRef.current &&
          !scrubbingRef.current &&
          Math.abs(t - prevPollTime) > 3
        ) {
          // Check if we just finished scrubbing (within the last 1 second) to prevent double-emit
          const timeSinceScrub = Date.now() - (scrubbingRef.lastScrubEnd || 0);
          if (timeSinceScrub > 1000) {
            watchTogetherService.seek(channelIdRef.current, t);
          }
        }
        prevPollTime = t;
      }
    }, 500);
  };

  const stopLiveTimePoll = () => {
    if (liveTimeRef.current) {
      clearInterval(liveTimeRef.current);
      liveTimeRef.current = null;
    }
  };

  // ── SponsorBlock polling ──────────────────────────────────────────────────

  const loadSponsorBlock = async (videoId) => {
    const segs = await fetchSponsorSegments(videoId);
    setSponsorSegments(segs);
    if (segs.length > 0) {
      showNotification(`📌 SponsorBlock: ${segs.length} segment(s) will be skipped`);
    }
    startSponsorPoll(segs);
  };

  const startSponsorPoll = (segs) => {
    stopSponsorPoll();
    if (!segs || segs.length === 0) return;
    sponsorPollRef.current = setInterval(() => {
      if (!sponsorBlockEnabled) return;
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
      const t = playerRef.current.getCurrentTime();
      for (const seg of segs) {
        if (t >= seg.start && t < seg.end - 0.5) {
          setSponsorSkipActive(true);
          showNotification(`📌 Skipping: ${seg.category}`);
          playerRef.current.seekTo(seg.end, true);
          setTimeout(() => setSponsorSkipActive(false), 2000);
          break;
        }
      }
    }, 500);
  };

  const stopSponsorPoll = () => {
    if (sponsorPollRef.current) {
      clearInterval(sponsorPollRef.current);
      sponsorPollRef.current = null;
    }
  };

  // ── Ad-blocker MutationObserver ───────────────────────────────────────────

  const startAdObserver = () => {
    stopAdObserver();
    // Poll every 750ms since MutationObserver can't cross iframe origins
    adObserverRef.current = setInterval(() => {
      if (!adSkipEnabled) return;
      try {
        const iframe = iframeRef.current || iframeContainerRef.current?.querySelector('iframe');
        if (!iframe) return;
        iframeRef.current = iframe;
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        const adIndicators = [
          doc.querySelector('.ytp-ad-player-overlay'),
          doc.querySelector('.ytp-ad-overlay-container'),
          doc.querySelector('.ytp-ad-text'),
          doc.querySelector('[class*="ad-showing"]'),
        ].filter(Boolean);

        if (adIndicators.length > 0) {
          setAdSkipActive(true);
          trySkipAd({ current: iframe });
          setTimeout(() => setAdSkipActive(false), 2000);
        }
      } catch (_) {
        // Cross-origin — can't access iframe document
      }
    }, 750);
  };

  const stopAdObserver = () => {
    if (adObserverRef.current) {
      clearInterval(adObserverRef.current);
      adObserverRef.current = null;
    }
  };

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopSponsorPoll();
      stopLiveTimePoll();
      stopAdObserver();
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
      }
      watchTogetherService.clearPlayerCallbacks();
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fullscreen handling ───────────────────────────────────────────────────

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
      const el = watchPanelRef.current;
      if (!el) return;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }, []);

  // Listen for native fullscreen changes (ESC key exits too)
  useEffect(() => {
    const onFSChange = () => {
      const entering = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(entering);
      if (entering) {
        setShowControlsInFullscreen(true);
      } else {
        if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
        setShowControlsInFullscreen(true);
      }
    };
    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    document.addEventListener('mozfullscreenchange', onFSChange);
    document.addEventListener('MSFullscreenChange', onFSChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', onFSChange);
      document.removeEventListener('webkitfullscreenchange', onFSChange);
      document.removeEventListener('mozfullscreenchange', onFSChange);
      document.removeEventListener('MSFullscreenChange', onFSChange);
    };
  }, []);

  // Auto-hide controls after 3s idle in fullscreen; mouse movement resets timer
  const handleMouseMove = useCallback(() => {
    if (!isFullscreen) return;
    setShowControlsInFullscreen(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      setShowControlsInFullscreen(false);
    }, 3000);
  }, [isFullscreen]);

  // Start the hide timer when entering fullscreen
  useEffect(() => {
    if (isFullscreen) {
      hideControlsTimerRef.current = setTimeout(() => setShowControlsInFullscreen(false), 3000);
    }
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [isFullscreen]);

  // ── User control handlers ─────────────────────────────────────────────────

  const handleSetVideo = (e) => {
    e.preventDefault();
    setInputError('');
    const videoId = watchTogetherService.constructor.extractVideoId(urlInput);
    if (!videoId) {
      setInputError('Invalid YouTube URL or video ID');
      return;
    }
    watchTogetherService.setVideo(channelId, videoId, '');
    setUrlInput('');
  };

  const handlePlayPause = () => {
    if (!playerRef.current) return;
    if (watchState.isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleScrubStart = (e) => {
    setScrubbing(true);
    setScrubValue(Number(e.target.value));
  };

  const handleScrubChange = (e) => {
    setScrubValue(Number(e.target.value));
    playerRef.current?.seekTo(Number(e.target.value), true);
  };

  const handleScrubEnd = (e) => {
    const t = Number(e.target.value);
    setScrubbing(false);
    scrubbingRef.current = false;
    scrubbingRef.lastScrubEnd = Date.now();
    setScrubValue(t);
    playerRef.current?.seekTo(t, true);
    watchTogetherService.seek(channelId, t);
  };

  const handleClose = () => {
    watchTogetherService.close(channelId);
    onClose && onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const progressPercent = duration > 0 ? (scrubValue / duration) * 100 : 0;

  return (
    <div
      ref={watchPanelRef}
      onMouseMove={handleMouseMove}
      className="watch-together-panel flex flex-col h-full bg-black/40 backdrop-blur-xl border-r border-surface-border relative overflow-hidden"
    >
      
      {/* Ambient glow background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-accent-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div 
        style={{ 
          opacity: (isFullscreen && !showControlsInFullscreen) ? 0 : 1,
          pointerEvents: (isFullscreen && !showControlsInFullscreen) ? 'none' : 'auto',
          transform: (isFullscreen && !showControlsInFullscreen) ? 'translateY(-16px)' : 'translateY(0)'
        }}
        className={`z-30 flex items-center justify-between px-4 py-3 shrink-0 transition-all duration-300 ${
          isFullscreen 
            ? 'absolute top-0 left-0 right-0 border-none bg-gradient-to-b from-black/80 to-transparent pt-6' 
            : 'relative border-b border-surface-border bg-surface-active/50 backdrop-blur-md'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center shadow-lg shadow-red-600/30">
            <TvMinimalPlay className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="text-text-primary font-bold text-sm flex items-center space-x-2">
              <span>Watch Together</span>
              <span className="text-[10px] bg-success/20 text-success border border-success/30 px-1.5 py-0.5 rounded font-mono uppercase font-bold animate-pulse">
                LIVE SYNC
              </span>
            </div>
            {watchState.title && (
              <div className="text-text-muted text-[11px] truncate max-w-xs">{watchState.title}</div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Ad-blocker toggle */}
          <button
            onClick={() => setAdSkipEnabled(v => !v)}
            title={adSkipEnabled ? 'Ad-Skip: ON (click to disable)' : 'Ad-Skip: OFF (click to enable)'}
            className={`flex items-center space-x-1 text-[10px] font-bold px-2 py-1 rounded border transition-all ${
              adSkipEnabled
                ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
                : 'bg-surface-hover border-surface-border text-text-muted hover:bg-surface-active'
            }`}
          >
            <ShieldOff className="w-3 h-3" />
            <span>AD-SKIP {adSkipEnabled ? 'ON' : 'OFF'}</span>
            {adSkipActive && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping ml-0.5" />}
          </button>

          {/* SponsorBlock toggle */}
          <button
            onClick={() => {
              setSponsorBlockEnabled(v => {
                const next = !v;
                if (next && sponsorSegments.length > 0) startSponsorPoll(sponsorSegments);
                else stopSponsorPoll();
                return next;
              });
            }}
            title={sponsorBlockEnabled ? 'SponsorBlock: ON' : 'SponsorBlock: OFF'}
            className={`flex items-center space-x-1 text-[10px] font-bold px-2 py-1 rounded border transition-all ${
              sponsorBlockEnabled
                ? 'bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30'
                : 'bg-surface-hover border-surface-border text-text-muted hover:bg-surface-active'
            }`}
          >
            <SkipForward className="w-3 h-3" />
            <span>SPONSORBLOCK {sponsorBlockEnabled ? 'ON' : 'OFF'}</span>
            {sponsorSkipActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping ml-0.5" />}
          </button>

          <button
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'}
            className="p-1.5 rounded-md bg-surface-hover hover:bg-surface-active text-text-muted hover:text-text-primary transition-all"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-md bg-surface-hover hover:bg-danger text-text-muted hover:text-white transition-all"
            title="Close Watch Together"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── URL Input / no-video state ──────────────────────────────────── */}
      {!watchState.videoId ? (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 space-y-6">
          <div className="w-24 h-24 rounded-2xl bg-red-600/20 border border-red-600/30 flex items-center justify-center shadow-2xl shadow-red-600/20">
            <Tv2 className="w-12 h-12 text-red-400" />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-text-primary mb-1">Start Watching Together</h3>
            <p className="text-text-muted text-sm max-w-sm">
              Paste a YouTube URL below. Everyone in the voice room will watch in perfect sync.
            </p>
          </div>

          <form onSubmit={handleSetVideo} className="w-full max-w-md space-y-3">
            <div className="relative">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setInputError(''); }}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full bg-surface-active border border-surface-border rounded-lg pl-10 pr-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/40 transition-all"
              />
            </div>
            {inputError && (
              <p className="text-red-400 text-xs font-medium">{inputError}</p>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg shadow-red-600/30 transition-all flex items-center justify-center space-x-2 hover:scale-[1.01] active:scale-95"
            >
              <TvMinimalPlay className="w-4 h-4" />
              <span>Start Video</span>
            </button>
          </form>

          <div className="flex items-center space-x-4 text-[11px] text-text-muted">
            <div className="flex items-center space-x-1"><ShieldOff className="w-3 h-3 text-red-400" /><span>Ad-Skip built in</span></div>
            <div className="flex items-center space-x-1"><SkipForward className="w-3 h-3 text-green-400" /><span>SponsorBlock</span></div>
            <div className="flex items-center space-x-1"><Users className="w-3 h-3 text-accent-primary" /><span>Full sync</span></div>
          </div>
        </div>
      ) : (
        <>
          {/* ── YouTube Player & Queue Sidebar ────────────────────────────── */}
          <div className="relative z-10 flex-1 min-h-0 bg-black flex flex-row overflow-hidden">
            <div
              ref={iframeContainerRef}
              className="flex-1 w-full relative"
              style={{ aspectRatio: 'unset' }}
            />
            
            {showQueue && (
              <div className="w-80 bg-surface-base border-l border-surface-border flex flex-col z-20">
                <div className="p-3 border-b border-surface-border flex items-center justify-between bg-surface-active">
                  <h3 className="text-text-primary font-bold text-sm flex items-center space-x-2">
                    <ListVideo className="w-4 h-4" />
                    <span>Up Next</span>
                  </h3>
                  <div className="text-xs text-text-muted font-mono">{watchState.queue?.length || 0} videos</div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {watchState.queue && watchState.queue.length > 0 ? (
                    watchState.queue.map((item, idx) => (
                      <div key={idx} className="bg-surface-panel border border-surface-border p-2 rounded-md flex items-start justify-between group">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="text-text-primary text-xs font-semibold truncate" title={item.title || item.video_id}>
                            {item.title || `Video ${item.video_id}`}
                          </div>
                          <div className="text-[10px] text-text-muted mt-0.5">Added by {item.added_by}</div>
                        </div>
                        <button
                          onClick={() => watchTogetherService.dequeueVideo(channelId, idx)}
                          className="text-text-muted hover:text-danger p-1 rounded hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-all"
                          title="Remove from queue"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted p-4 text-center space-y-2">
                      <ListVideo className="w-8 h-8 opacity-20" />
                      <p className="text-xs">The queue is empty.</p>
                    </div>
                  )}
                </div>

                <div className="p-3 border-t border-surface-border bg-surface-active flex flex-col space-y-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const url = e.target.elements.qurl.value;
                      const vid = watchTogetherService.constructor.extractVideoId(url);
                      if (vid) {
                        watchTogetherService.enqueueVideo(channelId, vid, '');
                        e.target.reset();
                      }
                    }}
                    className="flex space-x-2"
                  >
                    <input
                      name="qurl"
                      type="text"
                      placeholder="Paste URL to queue..."
                      className="flex-1 min-w-0 bg-surface-panel border border-surface-border rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                    />
                    <button type="submit" className="px-3 py-1.5 bg-accent-primary hover:bg-accent-hover text-white text-xs font-bold rounded-md transition-all">
                      Add
                    </button>
                  </form>
                  <button
                    onClick={() => watchTogetherService.playNext(channelId)}
                    disabled={!watchState.queue || watchState.queue.length === 0}
                    className="w-full py-2 bg-surface-panel border border-surface-border hover:bg-surface-hover text-text-primary text-xs font-bold rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>Skip to Next</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Control bar — floats as overlay in fullscreen, docked normally ── */}
          <div
            className={[
              'z-20 shrink-0 px-4 pt-3 pb-4 bg-surface-active/90 backdrop-blur-xl border-t border-surface-border space-y-2 transition-all duration-300',
              isFullscreen ? 'absolute bottom-0 left-0 right-0' : 'relative',
              isFullscreen && !showControlsInFullscreen ? 'opacity-0 translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0',
            ].join(' ')}
          >

            {/* Notification toast */}
            {notification && (
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-surface-active border border-surface-border text-text-primary text-xs font-semibold px-3 py-1.5 rounded-full shadow-xl whitespace-nowrap animate-fadeIn">
                {notification}
              </div>
            )}

            {/* Progress / seek bar */}
            <div className="relative w-full h-5 flex items-center group">
              {/* Sponsor segment markers */}
              {sponsorSegments.map((seg, i) => (
                <div
                  key={i}
                  className="absolute h-1.5 bg-green-500/70 rounded-full pointer-events-none"
                  style={{
                    left: `${(seg.start / duration) * 100}%`,
                    width: `${((seg.end - seg.start) / duration) * 100}%`,
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}
                />
              ))}
              <div className="absolute inset-x-0 h-1.5 bg-surface-border rounded-full top-1/2 -translate-y-1/2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.5}
                value={scrubValue}
                onMouseDown={handleScrubStart}
                onChange={handleScrubChange}
                onMouseUp={handleScrubEnd}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-5"
              />
              {/* Scrub thumb */}
              <div
                className="absolute w-3 h-3 bg-white rounded-full shadow-lg shadow-red-500/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `calc(${progressPercent}% - 6px)`, top: '50%', transform: 'translateY(-50%)' }}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {/* Play / Pause */}
                <button
                  onClick={handlePlayPause}
                  className="w-9 h-9 rounded-full bg-white hover:bg-gray-100 text-black flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  {watchState.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                {/* Time */}
                <div className="flex items-center space-x-1 text-xs text-text-muted font-mono">
                  <Clock className="w-3 h-3" />
                  <span>{formatTime(liveTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {/* Volume */}
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setIsMuted(v => !v)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      if (v > 0) setIsMuted(false);
                      playerRef.current?.setVolume(v);
                    }}
                    className="w-20 h-1 accent-red-500 cursor-pointer"
                  />
                  <span className="text-[10px] text-text-muted font-mono w-6">{isMuted ? '0' : volume}%</span>
                </div>

                {/* Change video input (compact) */}
                <form onSubmit={handleSetVideo} className="flex items-center space-x-1">
                  <div className="relative">
                    <Link className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => { setUrlInput(e.target.value); setInputError(''); }}
                      placeholder="Change video URL..."
                      className="bg-surface-hover border border-surface-border rounded-md pl-7 pr-2 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary w-44 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-md transition-all"
                  >
                    Go
                  </button>
                </form>

                {/* Fullscreen toggle button */}
                <button
                  onClick={handleToggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen (ESC)' : 'Enter Fullscreen'}
                  className="p-2 rounded-md bg-surface-hover hover:bg-white/10 text-text-muted hover:text-white transition-all"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Queue toggle button */}
                <button
                  onClick={() => setShowQueue(!showQueue)}
                  title="Toggle Queue"
                  className={`p-2 rounded-md transition-all ${
                    showQueue ? 'bg-accent-primary/20 text-accent-primary' : 'bg-surface-hover text-text-muted hover:text-white'
                  }`}
                >
                  <ListVideo className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Status badges row */}
            <div className="flex items-center space-x-2 text-[10px] font-mono">
              {adSkipEnabled && (
                <span className={`flex items-center space-x-0.5 px-1.5 py-0.5 rounded border ${adSkipActive ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-surface-hover border-surface-border text-text-muted'}`}>
                  <ShieldOff className="w-2.5 h-2.5 mr-0.5" />
                  AD-SKIP {adSkipActive ? '🚫 ACTIVE' : 'READY'}
                </span>
              )}
              {sponsorBlockEnabled && (
                <span className={`flex items-center space-x-0.5 px-1.5 py-0.5 rounded border ${sponsorSkipActive ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-surface-hover border-surface-border text-text-muted'}`}>
                  <SkipForward className="w-2.5 h-2.5 mr-0.5" />
                  SPONSORBLOCK {sponsorSegments.length > 0 ? `${sponsorSegments.length} SEGS` : 'NO DATA'}
                </span>
              )}
              {watchState.lastActivity && (
                <span className="text-text-muted ml-auto truncate max-w-xs">{watchState.lastActivity}</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
