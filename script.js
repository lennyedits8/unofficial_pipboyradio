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

// Add slugify here
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") // remove spaces, punctuation, apostrophes, etc
    .trim();
}

//////////////////// scenarios toggle //////////////////////
// === Scenario Toggle (Global) ===

// Get elements
const scenariosSwitch = document.getElementById('scenariosSwitch');
const scenariosLabel = document.getElementById('scenariosLabel');

// Load previous setting or default to true (ON)
let scenariosEnabled = localStorage.getItem('scenariosEnabled');
if (scenariosEnabled === null) {
  scenariosEnabled = 'true'; // default ON
  localStorage.setItem('scenariosEnabled', 'true');
}
scenariosEnabled = scenariosEnabled === 'true';

// Reflect state in UI
scenariosSwitch.checked = scenariosEnabled;
scenariosLabel.textContent = `Intermission: ${scenariosEnabled ? 'ON' : 'OFF'}`;

// Update on toggle
scenariosSwitch.addEventListener('change', () => {
  const enabled = scenariosSwitch.checked;
  localStorage.setItem('scenariosEnabled', enabled);
  scenariosLabel.textContent = `Intermission: ${enabled ? 'ON' : 'OFF'}`;
});


// ========================
// Theme
// ========================
function updateThemeLabel() {
  themeLabel.textContent = document.body.getAttribute("data-theme") === "vegas" ? "New Vegas" : "Fallout 4";
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
let isDragging = false;
let lastVolume = 100;
const station = document.body.dataset.station;
let stationIntermission = null;  // This will hold intermission metadata from JSON


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
    // simulate shuffle choice without consuming it
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
  // If we are inside a scenario OR last played track was a scenario clip
  if (inScenario || audio.src.includes(`voicelines/${station}/`)) {
    // Jump to previous main track
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

  // Normal prev logic
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
    // Skip the entire scenario
    scenarioInterrupted = true;
    inScenario = false;
    audio.pause();

    // Updated lines for lockscreen-safe scenarios
    audio.onended = handleAudioEnded;
    audio._hasHandler = true;

    // Fix for lockscreen: ensure scenarios run even if JS is throttled
    audio.addEventListener("ended", () => { if (!inScenario) Promise.resolve().then(handleAudioEnded); });


    // Move to next track, but don't trigger a new scenario immediately
    await nextTrack(true, false);
    return;
  }

  // Normal skip — use probability like auto-next
  const shouldRunScenario = (Object.keys(scenarios).length > 0) && (Math.random() < stationProbability);
  await nextTrack(true, shouldRunScenario);
});



prevBtn.addEventListener("click", () => {
  if (inScenario) {
    // Skip scenario immediately and go to previous main track
    scenarioInterrupted = true;
    audio.pause();
    audio.onended = null;
    inScenario = false;

    // Reattach main ended handler if missing
    if (!audio._hasHandler) {
      audio.addEventListener("ended", handleAudioEnded);
      audio._hasHandler = true;
    }

    // Jump to previous track in main playlist
    prevTrack(true);
    return;
  }

  // Normal prev logic (unchanged for pages without scenarios)
  prevTrack(true);
});



// ========================
// Progress
// ========================
function updateProgress(){
  if(audio.duration && !isDragging){
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
progressSlider.addEventListener("input", ()=>{ 
  if(audio.duration){ 
    const percent=progressSlider.value;
    setProgressFill(percent);
    const newTime=(percent/100)*audio.duration;
    currentTimeEl.textContent=formatTime(newTime);
    audio.currentTime=newTime;
  }
});
function finishDrag(){ if(isDragging && audio.duration) audio.currentTime=(progressSlider.value/100)*audio.duration; isDragging=false; }
progressSlider.addEventListener("mouseup",finishDrag);
progressSlider.addEventListener("touchend",finishDrag);

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
    stationProbability = 0; // no voicelines = never trigger scenarios
  }

  // === Disable or enable the intermission toggle depending on availability ===
  const toggleContainer = scenariosSwitch?.closest(".toggle") || scenariosSwitch?.parentElement;
  const hasScenarios = Object.keys(scenarios).length > 0;

  if (!hasScenarios) {
    scenariosSwitch.checked = false;
    scenariosSwitch.disabled = true;
    localStorage.setItem('scenariosEnabled', 'false');
    scenariosLabel.textContent = "Intermission: OFF";

    // Grey out (keeps visible)
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

  // === Check if scenarios are disabled ===
  const scenariosEnabled = localStorage.getItem('scenariosEnabled') === 'true';
  if (!scenariosEnabled) {
    console.log("Scenarios disabled by user — skipping scenario playback.");
    nextTrack(false); // continue normal playback
    return;
  }

  
  if(!id){
    const keys = Object.keys(scenarios);
    // Weighted random selection
    let total = keys.reduce((sum,k)=>sum+(scenarios[k].probability||1),0);
    let r = Math.random()*total;
    for(const k of keys){
      r -= scenarios[k].probability||1;
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
      const base = file.replace(/\.[^/.]+$/, ""); // strip .ogg
      return base === nextSlug;
    });
    if (!pool.length) continue; // no match, skip this folder
  } else {
    continue; // nothing coming up or missing slug
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

  // ✅ New fix — fallback if scenario did nothing
  if (!scenarioInterrupted && audio.paused && !audio.src.includes('voicelines/')) {
    console.warn("Scenario produced no valid clips — skipping to next track");
    inScenario = false;
    nextTrack(false);
    return;
  }

  inScenario = false;
  if (!scenarioInterrupted && autoNext) nextTrack(false);
}

}



function handleAudioEnded() {
  if (inScenario) return; // scenario controls itself

  if (Object.keys(scenarios).length > 0) {
    if (Math.random() < stationProbability) {
      runScenario(); // only start scenario if probability hits
      return;
    }
  }

  // Otherwise just go to next song normally
  nextTrack(false);
}



// Attach once on page load
audio.onended = handleAudioEnded;
audio._hasHandler = true;


// ========================
// Init
// ========================
if(localStorage.getItem("theme")==="vegas"){ document.body.setAttribute("data-theme","vegas"); themeSwitch.checked=true; }
updateThemeLabel();
updateShuffleIconColor();
updateLoopIcon();
loadPlaylist();
loadStationVoicelines();


// Toggle tracklist visibility
document.querySelector(".tracklist .section-title")
  .addEventListener("click", () => {
    document.querySelector(".tracklist").classList.toggle("collapsed");
  });

  const hamburgerBtn = document.getElementById("hamburgerBtn");
const sideNav = document.getElementById("sideNav");
const sideNavOverlay = document.getElementById("sideNavOverlay");

function toggleSideNav() {
  hamburgerBtn.classList.toggle("active");
  sideNav.classList.toggle("open");
  sideNavOverlay.classList.toggle("open");
}

// Open / Close events
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

