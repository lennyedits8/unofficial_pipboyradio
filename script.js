// Vault Radio Player - Updated for tracklist loop/shuffle + station-specific voicelines

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

let shuffleEnabled = false;
let loopState = 0; // 0=no loop, 1=loop tracklist, 2=loop single track
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Help quick swaps in background
audio.preload = "auto";

// ========================
// Audio Context
// ========================
let audioCtx, gainNode, sourceNode;
let usingGain = !isIOS;

function initAudioContext() {
  if (isIOS) return false;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
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
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(e => console.warn(e));
}

// ========================
// Helpers
// ========================
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

//////////////////// scenarios toggle //////////////////////
// === Scenario Toggle (Global) ===
const scenariosSwitch = document.getElementById('scenariosSwitch');
const scenariosLabel = document.getElementById('scenariosLabel');

let scenariosEnabled = localStorage.getItem('scenariosEnabled');
if (scenariosEnabled === null) {
  scenariosEnabled = 'true';
  localStorage.setItem('scenariosEnabled', 'true');
}
scenariosEnabled = scenariosEnabled === 'true';

scenariosSwitch.checked = scenariosEnabled;
scenariosLabel.textContent = `Intermission: ${scenariosEnabled ? 'ON' : 'OFF'}`;

scenariosSwitch.addEventListener('change', () => {
  const enabled = scenariosSwitch.checked;
  localStorage.setItem('scenariosEnabled', enabled);
  scenariosLabel.textContent = `Intermission: ${enabled ? 'ON' : 'OFF'}`;
});

// ========================
// Theme
// ========================
function updateThemeLabel() {
  themeLabel.textContent = "Theme: " + (document.body.getAttribute("data-theme") === "vegas" ? "New Vegas" : "Fallout 4");
}
updateThemeLabel();

themeSwitch.addEventListener("change", () => {
  if (themeSwitch.checked) document.body.setAttribute("data-theme","vegas"), localStorage.setItem("theme","vegas");
  else document.body.removeAttribute("data-theme"), localStorage.setItem("theme","fallout4");
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
// Playlist & Station
// ========================
let tracks = [];
let currentTrack = 0;
let trackHistory = [];
let playedTracks = new Set();
let pendingSeek = null;
// iOS-safe pending seek (percent 0..100 until duration is known)
let pendingSeekPercent = null;
let isDragging = false;
let lastVolume = 100;
const station = document.body.dataset.station;
let stationIntermission = null;  // intermission metadata from JSON

// ========================
// Load Playlist
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
  } catch(err) { console.error("Failed to load playlist:", err); }
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

// ========================
// Load / Play / Pause
// ========================
function loadTrack(index, recordHistory = true) {
  if (recordHistory && currentTrack !== index && currentTrack !== null) trackHistory.push(currentTrack);
  currentTrack = index;
  const track = tracks[index];
  audio.src = track.file;

  // reset any prior pending seek tied to previous track
  pendingSeek = null;
  pendingSeekPercent = null;

  trackTitleEl.textContent = track.title;
  artistNameEl.textContent = track.artist;
  albumCoverEl.src = track.cover || "album-cover.jpg";

  document.querySelectorAll(".track-item").forEach((el, i) => el.classList.toggle("active", i === index));
  updateMediaSession(track);
}

function playTrack() {
  // apply pending percent seek if metadata already available
  if (pendingSeekPercent != null && audio.duration && Number.isFinite(audio.duration)) {
    const t = (pendingSeekPercent / 100) * audio.duration;
    try { audio.currentTime = t; } catch(_) {}
    pendingSeekPercent = null;
  }
  // apply seconds-based pending seek
  if (pendingSeek !== null) {
    try { audio.currentTime = pendingSeek; } catch(_) {}
    pendingSeek = null;
  }
  initAudioContext();
  ensureAudioContextResumed();
  audio.play();
  document.getElementById("playIcon").src = "images/pause.svg";
}

// apply pending seek when metadata becomes available
audio.addEventListener("loadedmetadata", () => {
  if (pendingSeekPercent != null && audio.duration && Number.isFinite(audio.duration)) {
    const t = (pendingSeekPercent / 100) * audio.duration;
    try { audio.currentTime = t; } catch(_) {}
    pendingSeekPercent = null;
  }
});

// some iOS builds only become seekable on canplay
audio.addEventListener("canplay", () => {
  if (pendingSeekPercent != null && audio.duration && Number.isFinite(audio.duration)) {
    const t = (pendingSeekPercent / 100) * audio.duration;
    try { audio.currentTime = t; } catch(_) {}
    pendingSeekPercent = null;
  }
});

function pauseTrack() {
  audio.pause();
  document.getElementById("playIcon").src = "images/play.svg";
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

    // Lock-screen Previous mirrors UI behavior
    navigator.mediaSession.setActionHandler("previoustrack", () => {
      if (inScenario) {
        scenarioInterrupted = true;
        audio.pause();
        audio.onended = null;
        inScenario = false;
        if (!audio._hasHandler) {
          audio.addEventListener("ended", handleAudioEnded);
          audio._hasHandler = true;
        }
        prevTrack(true);
        return;
      }
      prevTrack(true);
    });

    // Lock-screen Next triggers scenarios with same probability + toggle
    navigator.mediaSession.setActionHandler("nexttrack", async () => {
      if (inScenario) {
        scenarioInterrupted = true;
        inScenario = false;
        audio.pause();
        audio.onended = handleAudioEnded;
        audio._hasHandler = true;
      }
      const hasScenarios = Object.keys(scenarios).length > 0;
      const enabled = localStorage.getItem('scenariosEnabled') === 'true';
      const shouldRunScenario = hasScenarios && enabled && (Math.random() < stationProbability);
      await nextTrack(true, shouldRunScenario);
    });
  }
}

// ========================
// Controls
// ========================
playBtn.addEventListener("click", () => audio.paused ? playTrack() : pauseTrack());

shuffleBtn.addEventListener("click", () => { shuffleEnabled = !shuffleEnabled; playedTracks.clear(); updateShuffleIconColor(); });
function updateShuffleIconColor() {
  const iconFilter = getComputedStyle(document.body).getPropertyValue("--icon-filter").trim();
  shuffleIcon.style.filter = shuffleEnabled ? iconFilter : "brightness(0) saturate(0%) invert(100%) sepia(64%) saturate(0%) hue-rotate(360deg)";
}

loopBtn.addEventListener("click", () => { loopState = (loopState+1)%3; updateLoopIcon(); });
function updateLoopIcon() {
  const iconFilter = getComputedStyle(document.body).getPropertyValue("--icon-filter").trim();
  if(loopState===0){ loopIcon.src="images/loop.svg"; loopIcon.style.filter="brightness(0) saturate(0%) invert(100%) sepia(64%) saturate(0%) hue-rotate(360deg)";}
  else if(loopState===1){ loopIcon.src="images/loop.svg"; loopIcon.style.filter=iconFilter;}
  else { loopIcon.src="images/loop1.svg"; loopIcon.style.filter=iconFilter; }
}

// ========================
// Next / Prev Tracks
// ========================

// Helper: peek at what the next track *would* be
function peekNextTrackIndex() {
  if (loopState === 2) return currentTrack; // loop single
  if (shuffleEnabled) {
    const available = tracks.map((_, i) => i)
      .filter(i => !playedTracks.has(i) || playedTracks.size === tracks.length);
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  } else {
    if (currentTrack + 1 < tracks.length) return currentTrack + 1;
    if (loopState === 1) return 0;
    return null;
  }
}

async function nextTrack(manual=false, triggerScenario=false) {
  if(loopState===2){ audio.currentTime=0; playTrack(); return; }

  let nextIndex = null;

  if(shuffleEnabled){
    if(Number.isInteger(currentTrack) && currentTrack>=0) playedTracks.add(currentTrack);
    if(playedTracks.size===tracks.length){
      if(loopState===1) playedTracks.clear();
      else if(manual) nextIndex=0;
      else return;
    }
    if(nextIndex===null){
      if(tracks.length===1) nextIndex=0;
      else{
        let attempts=0;
        do{ nextIndex=Math.floor(Math.random()*tracks.length); attempts++; } 
        while(playedTracks.has(nextIndex) && playedTracks.size<tracks.length && attempts<50);
      }
    }
  } else{
    if(Number.isInteger(currentTrack) && currentTrack+1<tracks.length) nextIndex=currentTrack+1;
    else if(loopState===1) nextIndex=0;
    else if(manual) nextIndex=0;
    else return;
  }

  if(nextIndex===null) return;

  if(triggerScenario && Object.keys(scenarios).length>0) await runScenario(null, true);

  loadTrack(nextIndex);
  if(shuffleEnabled) playedTracks.add(nextIndex);
  playTrack();
}

function prevTrack(manual = true) {
  if (inScenario || audio.src.includes(`voicelines/${station}/`)) {
    if (trackHistory.length > 0) {
      const lastIndex = trackHistory.pop();
      loadTrack(lastIndex, false);
    } else if (loopState === 1) {
      loadTrack(tracks.length - 1, false);
    } else {
      loadTrack(0, false);
    }
    playTrack();
    return;
  }

  const restartThreshold = 3;
  const atStart = audio.currentTime < restartThreshold;

  if (loopState === 2) {
    audio.currentTime = 0;
    playTrack();
    return;
  }

  if (!atStart && manual) {
    audio.currentTime = 0;
    playTrack();
    return;
  }

  if (trackHistory.length > 0) {
    const lastIndex = trackHistory.pop();
    loadTrack(lastIndex, false);
  } else if (loopState === 1) {
    loadTrack(tracks.length - 1, false);
  } else {
    loadTrack(0, false);
  }

  playTrack();
}

nextBtn.addEventListener("click", async () => {
  if (inScenario) {
    scenarioInterrupted = true;
    inScenario = false;
    audio.pause();

    audio.onended = handleAudioEnded;
    audio._hasHandler = true;

    audio.addEventListener("ended", () => { if (!inScenario) Promise.resolve().then(handleAudioEnded); });

    await nextTrack(true, false);
    return;
  }

  const shouldRunScenario = (Object.keys(scenarios).length > 0) && (Math.random() < stationProbability);
  await nextTrack(true, shouldRunScenario);
});

prevBtn.addEventListener("click", () => {
  if (inScenario) {
    scenarioInterrupted = true;
    audio.pause();
    audio.onended = null;
    inScenario = false;

    if (!audio._hasHandler) {
      audio.addEventListener("ended", handleAudioEnded);
      audio._hasHandler = true;
    }

    prevTrack(true);
    return;
  }

  prevTrack(true);
});

// ========================
// Progress
// ========================
function updateProgress(){
  // don't auto-update while a pre-play seek is pending or user is dragging
  if ((pendingSeekPercent != null) || isDragging) {
    requestAnimationFrame(updateProgress);
    return;
  }
  if(audio.duration){
    const percent = (audio.currentTime/audio.duration)*100;
    progressSlider.value=percent;
    setProgressFill(percent);
    currentTimeEl.textContent=formatTime(audio.currentTime);
    totalTimeEl.textContent=formatTime(audio.duration);
  }
  requestAnimationFrame(updateProgress);
}
requestAnimationFrame(updateProgress);

progressSlider.addEventListener("mousedown", ()=>isDragging=true);
progressSlider.addEventListener("touchstart", ()=>isDragging=true);
progressSlider.addEventListener("input", () => { 
  const percent = Number(progressSlider.value);
  setProgressFill(percent);

  if (audio.duration && Number.isFinite(audio.duration)) {
    const newTime = (percent / 100) * audio.duration;
    currentTimeEl.textContent = formatTime(newTime);
    try { audio.currentTime = newTime; } catch(_) {}
    pendingSeekPercent = null;
  } else {
    // Metadata not ready yet (iOS before first play)
    pendingSeekPercent = percent;
    currentTimeEl.textContent = "0:00";
  }
});

function finishDrag(){
  if (isDragging && audio.duration && Number.isFinite(audio.duration)) {
    audio.currentTime = (progressSlider.value / 100) * audio.duration;
    pendingSeekPercent = null;
  } else if (isDragging) {
    // will apply on loadedmetadata/canplay/play
    pendingSeekPercent = Number(progressSlider.value);
  }
  isDragging = false;
}
progressSlider.addEventListener("mouseup", finishDrag);
progressSlider.addEventListener("touchend", finishDrag);

// ========================
// Volume
// ========================
function applyVolumeToOutput(vol){ const v=clamp(Number(vol))/100; usingGain?gainNode.gain.value=v:audio.volume=v; }
function updateVolumeUI(vol){ vol=clamp(Math.round(Number(vol))); if(String(volumeSlider.value)!==String(vol)) volumeSlider.value=vol; setVolumeFill(vol); volumeDisplay.textContent=`${vol}%`; if(vol===0) volumeIcon.src="images/mute.svg"; else if(vol<=40) volumeIcon.src="images/min.svg"; else volumeIcon.src="images/max.svg"; }
volumeSlider.addEventListener("input", e=>{ const vol=Number(e.target.value); applyVolumeToOutput(vol); updateVolumeUI(vol); if(vol>0) lastVolume=vol; });
volumeIcon.addEventListener("click", ()=>{ const currentOut = usingGain?gainNode.gain.value:audio.volume; if(currentOut>0){ lastVolume=clamp(Number(volumeSlider.value)); applyVolumeToOutput(0); updateVolumeUI(0); volumeSlider.value=0; } else{ applyVolumeToOutput(lastVolume); updateVolumeUI(lastVolume); volumeSlider.value=lastVolume; } });

// ========================
// Auto-next & scenarios
// ========================
let voicelines = {};
let scenarios = {};
let inScenario = false;
let scenarioInterrupted = false;
let stationProbability = 1.0; // default always trigger scenarios

async function loadStationVoicelines() {
  try {
    const res = await fetch(`tracklists/${station}_voicelines.json`);
    const data = await res.json();
    voicelines = data.voicelines || {};
    scenarios = data.scenarios || {};
    stationIntermission = data.intermission || null;
    stationProbability = data.probability || 1.0;
    console.log(`Loaded voicelines for ${station}, probability=${stationProbability}`);
  } catch (err) {
    console.log("No voicelines for station:", station);
    voicelines = {};
    scenarios = {};
    stationProbability = 0;
  }

  const toggleContainer = scenariosSwitch?.closest(".toggle") || scenariosSwitch?.parentElement;
  const hasScenarios = Object.keys(scenarios).length > 0;

  if (!hasScenarios) {
    scenariosSwitch.checked = false;
    scenariosSwitch.disabled = true;
    localStorage.setItem('scenariosEnabled', 'false');
    scenariosLabel.textContent = "Intermission: OFF";
    toggleContainer.style.opacity = "0.5";
    toggleContainer.style.pointerEvents = "none";
  } else {
    scenariosSwitch.disabled = false;
    toggleContainer.style.opacity = "1";
    toggleContainer.style.pointerEvents = "auto";
    const enabled = localStorage.getItem('scenariosEnabled') === 'true';
    scenariosSwitch.checked = enabled;
    scenariosLabel.textContent = `Intermission: ${enabled ? 'ON' : 'OFF'}`;
  }
}

async function runScenario(id=null, autoNext=true){
  if(!Object.keys(scenarios).length) return;

  const scenariosEnabled = localStorage.getItem('scenariosEnabled') === 'true';
  if (!scenariosEnabled) {
    nextTrack(false);
    return;
  }

  if(!id){
    const keys = Object.keys(scenarios);
    let total = keys.reduce((sum,k)=>sum+(scenarios[k].probability||1),0);
    let r = Math.random()*total;
    for(const k of keys){
      r -= (scenarios[k].probability||1);
      if(r <= 0){ id = k; break; }
    }
  }

  const scenarioObj = scenarios[id];
  if(!scenarioObj) return;
  const sequence = scenarioObj.sequence;
  if(!sequence?.length) return;

  inScenario = true; 
  scenarioInterrupted = false;
  pauseTrack();
  audio.removeEventListener("ended", handleAudioEnded);

  const intermissionMeta = stationIntermission || {
    title: "Intermission",
    artist: "DJ Three Dog",
    cover: "images/intermission.jpg"
  };

  trackTitleEl.textContent = intermissionMeta.title;
  artistNameEl.textContent = intermissionMeta.artist;
  albumCoverEl.src = intermissionMeta.cover;

  try {
    for (const folder of sequence) {
      if (scenarioInterrupted) break;
      let pool = voicelines[folder];
      if (!pool?.length) continue;

      if (folder === "musicintrospecific") {
        const nextIndex = peekNextTrackIndex();
        if (nextIndex !== null && tracks[nextIndex].slug) {
          const nextSlug = tracks[nextIndex].slug;
          pool = pool.filter(file => {
            const base = file.replace(/\.[^/.]+$/, "");
            return base === nextSlug;
          });
          if (!pool.length) continue;
        } else {
          continue;
        }
      }

      const choice = pool[Math.floor(Math.random() * pool.length)];
      audio.src = `voicelines/${station}/${folder}/${choice}`;
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        playTrack();
      });
    }
  } catch(e) {
    console.warn("Scenario interrupted", e);
  } finally {
    audio.onended = null;
    if(!audio._hasHandler){
      audio.addEventListener("ended", handleAudioEnded);
      audio._hasHandler = true;
    }

    if (!scenarioInterrupted && audio.paused && !audio.src.includes('voicelines/')) {
      inScenario = false;
      nextTrack(false);
      return;
    }

    inScenario = false;
    if (!scenarioInterrupted && autoNext) nextTrack(false);
  }
}

function handleAudioEnded() {
  if (inScenario) return;

  if (Object.keys(scenarios).length > 0) {
    if (Math.random() < stationProbability) {
      runScenario();
      return;
    }
  }
  nextTrack(false);
}

// Attach once on page load
audio.onended = handleAudioEnded;
audio._hasHandler = true;

// Background-safe 'ended' fallback so chaining works when page is hidden
if (!audio._bgFallbackBound) {
  audio.addEventListener("ended", () => {
    if (!inScenario) Promise.resolve().then(handleAudioEnded);
  }, { passive: true });
  audio._bgFallbackBound = true;
}

// ========================
// Init
// ========================
if(localStorage.getItem("theme")==="vegas"){ document.body.setAttribute("data-theme","vegas"); themeSwitch.checked=true; }
updateThemeLabel();
updateShuffleIconColor();
updateLoopIcon();
loadPlaylist();
loadStationVoicelines();

// ========================
// Tracklist View All / View Less
// ========================
const MAX_VISIBLE_TRACKS = 5;
let showingAllTracks = false;

const viewToggleBtn = document.createElement("button");
viewToggleBtn.className = "view-toggle-btn";
viewToggleBtn.textContent = "View All";
trackListEl.after(viewToggleBtn);

function updateTrackListVisibility() {
  const items = trackListEl.querySelectorAll(".track-item");
  items.forEach((item, i) => {
    item.style.display = showingAllTracks || i < MAX_VISIBLE_TRACKS ? "list-item" : "none";
  });
  viewToggleBtn.textContent = showingAllTracks ? "View Less" : "View All";
}

viewToggleBtn.addEventListener("click", (e) => {
  e.preventDefault();
  showingAllTracks = !showingAllTracks;
  updateTrackListVisibility();
  trackListEl.scrollIntoView({ behavior: "smooth" });
});

const originalBuildTrackList = buildTrackList;
buildTrackList = function() {
  originalBuildTrackList();
  updateTrackListVisibility();
};

/*// Toggle tracklist visibility
document.querySelector(".tracklist .section-title")
  .addEventListener("click", () => {
    document.querySelector(".tracklist").classList.toggle("collapsed");
  });*/

const hamburgerBtn = document.getElementById("hamburgerBtn");
const sideNav = document.getElementById("sideNav");
const sideNavOverlay = document.getElementById("sideNavOverlay");

function toggleSideNav() {
  hamburgerBtn.classList.toggle("active");
  sideNav.classList.toggle("open");
  sideNavOverlay.classList.toggle("open");
}

hamburgerBtn.addEventListener("click", toggleSideNav);
sideNavOverlay.addEventListener("click", toggleSideNav);

const sideNavClose = document.getElementById('sideNavClose');

sideNavClose.addEventListener('click', () => {
  sideNav.classList.remove('open');
  sideNavOverlay.classList.remove('open');
});

sideNavOverlay.addEventListener('click', () => {
  sideNav.classList.remove('open');
  sideNavOverlay.classList.remove('open');
});
