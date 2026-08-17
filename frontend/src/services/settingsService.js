/**
 * settingsService.js
 * Handles loading and auto-saving all user preferences to the backend database.
 * Settings are also mirrored to localStorage as a fast cache.
 */

import { authAPI } from './api';
import { voiceManager } from './webrtcVoice';

const DEBOUNCE_MS = 500;
let saveTimer = null;

// All the localStorage keys that belong to user settings
const SETTINGS_KEYS = [
  'discoalto_input_mode',
  'discoalto_ptt_key',
  'discoalto_echo_cancellation',
  'discoalto_noise_suppression',
  'discoalto_auto_gain',
  'discoalto_vad_sensitivity',
  'discoalto_audio_input',
  'discoalto_audio_output',
  'discoalto_video_input',
  'discoalto_input_volume',
  'discoalto_output_volume',
  'discoalto_audio_bitrate',
];

/** Collect current settings from localStorage into a plain object */
export function gatherSettings() {
  const obj = {};
  SETTINGS_KEYS.forEach(key => {
    const val = localStorage.getItem(key);
    if (val !== null) obj[key] = val;
  });
  return obj;
}

/** Apply a settings object: write to localStorage and apply to voiceManager */
export function applySettings(settings) {
  if (!settings || typeof settings !== 'object') return;

  SETTINGS_KEYS.forEach(key => {
    if (settings[key] !== undefined) {
      localStorage.setItem(key, settings[key]);
    }
  });

  // Apply voice manager settings
  const inputMode = settings['discoalto_input_mode'];
  if (inputMode) voiceManager.setInputMode(inputMode);

  const pttKey = settings['discoalto_ptt_key'];
  if (pttKey) voiceManager.setPttKey(pttKey);

  const echo = settings['discoalto_echo_cancellation'];
  const noise = settings['discoalto_noise_suppression'];
  const gain = settings['discoalto_auto_gain'];
  const vad = settings['discoalto_vad_sensitivity'];

  voiceManager.setAudioProcessing({
    ...(echo !== undefined && { echoCancellation: echo === 'true' }),
    ...(noise !== undefined && { noiseSuppression: noise === 'true' }),
    ...(gain !== undefined && { autoGainControl: gain === 'true' }),
    ...(vad !== undefined && { vadSensitivity: Number(vad) }),
  });
}

/** Load settings from the backend and apply them */
export async function loadSettings() {
  try {
    const res = await authAPI.getSettings();
    const settings = res.data;
    if (settings && Object.keys(settings).length > 0) {
      applySettings(settings);
    }
  } catch (err) {
    console.warn('Could not load settings from server, using localStorage cache.', err);
  }
}

/** Save current settings to the backend (debounced) */
export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const settings = gatherSettings();
      await authAPI.saveSettings(settings);
    } catch (err) {
      console.warn('Failed to auto-save settings:', err);
    }
  }, DEBOUNCE_MS);
}
