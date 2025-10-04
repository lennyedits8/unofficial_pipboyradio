// Vault Radio Player - Updated for tracklist loop/shuffle + 3-state loop

// ========================
// Elements
// ========================
const audio = document.getElementById("audioPlayer");
const playBtn = document.getElementById("playBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressSlider = document.getElementById("progressSlider");
const volumeSlider = document.getElementById("volumeSlider");
const currentTimeEl = document.querySelector(".current-time");
const totalTimeEl = document.querySelector(".total-time");
const trackTitleEl = document.querySelector(".track-title");
const artistNameEl = document.querySelector(".artist-name");
const volumeDisplay = document.querySelector(".volume-display");
const trackListEl = document.querySelector(".track-list");
const albumCoverEl = document.querySelector(".album-cover");
const volumeIcon = document.getElementById("volumeIcon");
const themeSwitch = document.getElementById("themeSwitch");
const themeLabel = document.getElementById("themeLabel");
const shuffleBtn = document.getElementById("shuffleBtn");
const shuffleIcon = document.getElementById("shuffleIcon");
const loopBtn = document.getElementById("loopBtn");
const loopIcon = document.getElementById("loopIcon");

let shuffleEnabled = false; // tracks shuffle state
let loopState = 0;          // 0 = no loop, 1 = loop tracklist, 2 = loop single track

// Detect iOS devices to handle background audio restrictions
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// ========================
// Shuffle function
// ========================
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ========================
// Playlist
// ========================
let tracks = [];
const station = document.body.dataset.station; // HTML-defined station

let currentTrack = 0;
let pendingSeek = null;
let isDragging = false;
let lastVolume = 100;
let playedTracks = new Set(); // tracks played in shuffle mode

// ========================
// Web Audio API Setup
// ========================
let audioCtx, gainNode, sourceNode;
// Disable Web Audio on iOS so lockscreen playback works
let usingGain = !isIOS;

function initAudioContext() {
  if (isIOS) return false; // skip Web Audio on iOS

  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    audioCtx = new AudioContext();
    gainNode = audioCtx.createGain();
    sourceNode = audioCtx.createMediaElementSource(audio);
    sourceNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    usingGain = true;
  }
  return usingGain;
}


function ensureAudioContextResumed() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(e => console.warn("AudioContext resume failed:", e));
  }
}

// ========================
// Helpers
// ========================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ========================
// Theme
// ========================
function updateThemeLabel() {
  if (document.body.getAttribute("data-theme") === "vegas") themeLabel.textContent = "New Vegas";
  else themeLabel.textContent = "Fallout 4";
}
updateThemeLabel();

themeSwitch.addEventListener("change", () => {
  if (themeSwitch.checked) {
    document.body.setAttribute("data-theme", "vegas");
    localStorage.setItem("theme", "vegas");
  } else {
    document.body.removeAttribute("data-theme");
    localStorage.setItem("theme", "fallout4");
  }
  setProgressFill(progressSlider.value);
  setVolumeFill(volumeSlider.value);
  updateThemeLabel();
  updateShuffleIconColor();
  updateLoopIcon();
});

function getThemeColors() {
  const styles = getComputedStyle(document.body);
  return { primary: styles.getPropertyValue("--color-primary").trim(), dim: styles.getPropertyValue("--color-dim").trim() };
}

function setProgressFill(percent) {
  const { primary, dim } = getThemeColors();
  progressSlider.style.background = `linear-gradient(to right, ${primary} ${percent}%, ${dim} ${percent}%)`;
}

function setVolumeFill(vol) {
  const { primary, dim } = getThemeColors();
  volumeSlider.style.background = `linear-gradient(to right, ${primary} 0%, ${primary} ${vol}%, ${dim} ${vol}%, ${dim} 100%)`;
}

// ========================
// Media Session
// ========================
function updateMediaSession(track) {
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "Pip-Boy Radio",
      artwork: [{ src: track.cover || "album-cover.jpg", sizes: "512x512", type: "image/jpeg" }]
    });
    navigator.mediaSession.setActionHandler("play", playTrack);
    navigator.mediaSession.setActionHandler("pause", pauseTrack);
    navigator.mediaSession.setActionHandler("previoustrack", () => { prevTrack(); playTrack(); });
    navigator.mediaSession.setActionHandler("nexttrack", () => { nextTrack(); playTrack(); });
  }
}

// ========================
// Track Handling
// ========================
function loadTrack(index) {
  currentTrack = index;
  const track = tracks[index];
  audio.src = track.file;
  trackTitleEl.textContent = track.title;
  artistNameEl.textContent = track.artist;
  albumCoverEl.src = track.cover || "album-cover.jpg";

  document.querySelectorAll(".track-item").forEach((el, i) => el.classList.toggle("active", i === index));
  updateMediaSession(track);
}

function playTrack() {
  if (pendingSeek !== null) { audio.currentTime = pendingSeek; pendingSeek = null; }
  initAudioContext();
  ensureAudioContextResumed();
  audio.play();
  document.getElementById("playIcon").src = "images/pause.svg";
}

function pauseTrack() {
  audio.pause();
  document.getElementById("playIcon").src = "images/play.svg";
}

// ========================
// Controls
// ========================
playBtn.addEventListener("click", () => audio.paused ? playTrack() : pauseTrack());

// Shuffle button
shuffleBtn.addEventListener("click", () => { shuffleEnabled = !shuffleEnabled; playedTracks.clear(); updateShuffleIconColor(); });
function updateShuffleIconColor() {
  const iconFilter = getComputedStyle(document.body).getPropertyValue("--icon-filter").trim();
  shuffleIcon.style.filter = shuffleEnabled ? iconFilter : "brightness(0) saturate(0%) invert(100%) sepia(64%) saturate(0%) hue-rotate(360deg)";
}

// Loop button (3-state: no loop → loop tracklist → loop single track)
loopBtn.addEventListener("click", () => {
  loopState = (loopState + 1) % 3; // cycle 0 → 1 → 2 → 0
  updateLoopIcon();
});

function updateLoopIcon() {
  const iconFilter = getComputedStyle(document.body).getPropertyValue("--icon-filter").trim();
  if (loopState === 0) {
    loopIcon.src = "images/loop.svg";
    loopIcon.style.filter = "brightness(0) saturate(0%) invert(100%) sepia(64%) saturate(0%) hue-rotate(360deg)";
  } else if (loopState === 1) {
    loopIcon.src = "images/loop.svg";
    loopIcon.style.filter = iconFilter;
  } else if (loopState === 2) {
    loopIcon.src = "images/loop1.svg";
    loopIcon.style.filter = iconFilter;
  }
}

// ========================
// Next / Prev with loop states
// ========================
let trackHistory = []; // store history of played tracks

function loadTrack(index, recordHistory = true) {
  if (recordHistory && currentTrack !== index) trackHistory.push(currentTrack);

  currentTrack = index;
  const track = tracks[index];
  audio.src = track.file;
  trackTitleEl.textContent = track.title;
  artistNameEl.textContent = track.artist;
  albumCoverEl.src = track.cover || "album-cover.jpg";

  document.querySelectorAll(".track-item").forEach((el, i) => el.classList.toggle("active", i === index));
  updateMediaSession(track);
}

function nextTrack(manual = false) {
  // Single-track loop
  if (loopState === 2) {
    audio.currentTime = 0;
    playTrack();
    return;
  }

  if (shuffleEnabled) {
    playedTracks.add(currentTrack);

    // All tracks played?
    if (playedTracks.size === tracks.length) {
      if (loopState === 1) {
        playedTracks.clear(); // reset for tracklist loop
      } else if (manual) {
        playedTracks.clear(); // reset so manual next works
        loadTrack(0);
        pauseTrack();
        return;
      } else {
        return; // auto-next stops
      }
    }

    // Pick a random unplayed track
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } while (playedTracks.has(nextIndex) && playedTracks.size < tracks.length);

    loadTrack(nextIndex);
  } else {
    // Sequential mode
    if (currentTrack + 1 < tracks.length) {
      loadTrack(currentTrack + 1);
    } else if (loopState === 1) {
      loadTrack(0); // tracklist loop
    } else if (manual) {
      loadTrack(0);
      pauseTrack();
      return;
    } else {
      return; // auto-next stops
    }
  }

  playTrack();
}

function prevTrack(manual = true) {
  const restartThreshold = 3; // seconds
  const atStart = audio.currentTime < restartThreshold;

  if (loopState === 2) { // single-track loop
    audio.currentTime = 0;
    playTrack();
    return;
  }

  if (!atStart && manual) {
    // first click restarts current track
    audio.currentTime = 0;
    playTrack();
    return;
  }

  // Go to last played track from history
  if (trackHistory.length > 0) {
    const lastIndex = trackHistory.pop();
    loadTrack(lastIndex, false); // don't push to history
  } else if (loopState === 1) {
    loadTrack(tracks.length - 1, false); // wrap to last track
  } else {
    loadTrack(0, false); // stay on first track
  }

  playTrack(); // always auto-play
}

nextBtn.addEventListener("click", () => nextTrack(true));
prevBtn.addEventListener("click", () => prevTrack(true));


// ========================
// Progress Bar
// ========================
function updateProgress() {
  if (audio.duration && !isDragging) {
    const percent = (audio.currentTime / audio.duration) * 100;
    progressSlider.value = percent;
    setProgressFill(percent);
    currentTimeEl.textContent = formatTime(audio.currentTime);
    totalTimeEl.textContent = formatTime(audio.duration);
  }
  requestAnimationFrame(updateProgress);
}
requestAnimationFrame(updateProgress);

progressSlider.addEventListener("mousedown", () => isDragging = true);
progressSlider.addEventListener("touchstart", () => isDragging = true);

progressSlider.addEventListener("input", () => {
  if (audio.duration) {
    const percent = progressSlider.value;
    setProgressFill(percent);
    const newTime = (percent / 100) * audio.duration;
    currentTimeEl.textContent = formatTime(newTime);
    audio.currentTime = newTime;
  }
});

function finishDrag() {
  if (isDragging && audio.duration) audio.currentTime = (progressSlider.value / 100) * audio.duration;
  isDragging = false;
}
progressSlider.addEventListener("mouseup", finishDrag);
progressSlider.addEventListener("touchend", finishDrag);

// ========================
// Volume Control
// ========================
function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }
function applyVolumeToOutput(vol) {
  const v = clamp(Number(vol)) / 100;
  if (usingGain) gainNode.gain.value = v;
  else audio.volume = v;
}

function updateVolumeUI(vol) {
  vol = clamp(Math.round(Number(vol)));
  if (String(volumeSlider.value) !== String(vol)) volumeSlider.value = vol;
  setVolumeFill(vol);
  volumeDisplay.textContent = `${vol}%`;
  if (vol === 0) volumeIcon.src = "images/mute.svg";
  else if (vol <= 40) volumeIcon.src = "images/min.svg";
  else volumeIcon.src = "images/max.svg";
}

volumeSlider.addEventListener("input", e => { const vol = Number(e.target.value); applyVolumeToOutput(vol); updateVolumeUI(vol); if (vol>0) lastVolume=vol; });
volumeIcon.addEventListener("click", () => {
  ensureAudioContextResumed();
  const currentOut = usingGain ? gainNode.gain.value : audio.volume;
  if (currentOut>0) { lastVolume=clamp(Number(volumeSlider.value)); applyVolumeToOutput(0); updateVolumeUI(0); volumeSlider.value=0; }
  else { applyVolumeToOutput(lastVolume); updateVolumeUI(lastVolume); volumeSlider.value=lastVolume; }
});

// Keyboard volume
volumeSlider.addEventListener("keydown", e => {
  const cur = clamp(Number(volumeSlider.value));
  let next = cur;
  if (["ArrowLeft","ArrowDown"].includes(e.key)) { e.preventDefault(); next = clamp(cur-1); }
  else if (["ArrowRight","ArrowUp"].includes(e.key)) { e.preventDefault(); next = clamp(cur+1); }
  else if (e.key==="PageDown") { e.preventDefault(); next = clamp(cur-10); }
  else if (e.key==="PageUp") { e.preventDefault(); next = clamp(cur+10); }
  if(next!==cur){ volumeSlider.value=next; applyVolumeToOutput(next); updateVolumeUI(next); if(next>0) lastVolume=next;}
});

// ========================
// Auto-next track
// ========================
audio.addEventListener("ended", () => nextTrack(false));


// ========================
// Mobile unlock for AudioContext
// ========================
function unlockAudioContext() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().then(() => {
      console.log("AudioContext resumed successfully");
      document.removeEventListener("touchend", unlockAudioContext);
      document.removeEventListener("click", unlockAudioContext);
    }).catch(err => console.warn("Failed to resume AudioContext:", err));
  }
}

// Listen for the first user gesture to unlock
document.addEventListener("touchend", unlockAudioContext, { once: true });
document.addEventListener("click", unlockAudioContext, { once: true });

// ========================
// Init
// ========================
if(localStorage.getItem("theme")==="vegas"){ document.body.setAttribute("data-theme","vegas"); themeSwitch.checked=true; }
updateThemeLabel();
updateShuffleIconColor();
updateLoopIcon();

// ========================
// Load playlist
// ========================
async function loadPlaylist() {
  try {
    const res = await fetch(`tracklists/${station}.json`);
    tracks = await res.json();
    buildTrackList();
    loadTrack(0);
    const initialVol = parseInt(volumeSlider.value, 10) || 100;
    applyVolumeToOutput(initialVol);
    updateVolumeUI(initialVol);
    setProgressFill(progressSlider.value);
    setVolumeFill(volumeSlider.value);
  } catch (err) { console.error("Failed to load playlist:", err); }
}

function buildTrackList() {
  trackListEl.innerHTML = "";
  tracks.forEach((track, i) => {
    const li = document.createElement("li");
    li.textContent = `${track.artist} - ${track.title}`;
    li.classList.add("track-item");
    li.addEventListener("click", () => { loadTrack(i); playTrack(); });
    trackListEl.appendChild(li);
  });
}

// Kickoff
loadPlaylist();

// Highlight current radio station tile
document.addEventListener("DOMContentLoaded", ()=>{
  const stationLinks = document.querySelectorAll('.station-tile');
  stationLinks.forEach(link=>{ if(link.pathname===window.location.pathname) link.classList.add('active'); });
});

// Toggle tracklist visibility
document.querySelector(".tracklist .section-title")
  .addEventListener("click", () => {
    document.querySelector(".tracklist").classList.toggle("collapsed");
  });
