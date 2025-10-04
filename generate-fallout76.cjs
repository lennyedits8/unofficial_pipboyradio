const fs = require("fs");
const path = require("path");
const mm = require("music-metadata");
const NodeID3 = require("node-id3");
const { Metaflac } = require("metaflac-js");

const musicFolder = path.join(__dirname, "music", "fallout76");
const coverFolder = path.join(__dirname, "covers", "fallout76");
const outputFile  = path.join(__dirname, "tracklists", "fallout76.json");

function cleanTitle(title) {
  return title
    .replace(/\s*\((album|single|original) version\)/ig, "")
    .replace(/\s*\(\d{4}\s*single version\)/ig, "")
    .replace(/\s*\(\d{4}\s*remastered\)/ig, "")
    .replace(/\s*\(remastered\s*\d{4}\)/ig, "")
    .replace(/\s*\(remastered\)/ig, "")
    .trim();
}

if (!fs.existsSync(coverFolder)) {
  fs.mkdirSync(coverFolder, { recursive: true });
}

async function processFiles() {
  const files = fs.readdirSync(musicFolder).filter(f => 
    f.endsWith(".mp3") || f.endsWith(".flac") || f.endsWith(".wav")
  );
  const tracklist = [];

  for (const file of files) {
    const filePath = path.join(musicFolder, file);
    try {
      const metadata = await mm.parseFile(filePath);
      let title = metadata.common.title || path.parse(file).name;
      const artist = metadata.common.artist || "Unknown Artist";

      title = cleanTitle(title);

      // Handle cover art
      let coverFile = "images/default-cover.jpg";
      let coverPath = null;
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0];
        const coverName = path.parse(file).name.replace(/\s+/g, "").toLowerCase() + ".jpg";
        coverFile = `./covers/fallout76/${coverName}`;
        coverPath = path.join(coverFolder, coverName);
        fs.writeFileSync(coverPath, picture.data);
      }

      // Write tags depending on file type
      if (file.endsWith(".mp3")) {
        const tags = {
          title,
          artist,
          APIC: coverPath || undefined
        };
        NodeID3.update(tags, filePath);
      } else if (file.endsWith(".flac")) {
        const flac = new Metaflac(filePath);
        flac.removeTag("TITLE");
        flac.removeTag("ARTIST");
        flac.setTag(`TITLE=${title}`);
        flac.setTag(`ARTIST=${artist}`);
        if (coverPath) {
          flac.importPicture(coverPath);
        }
      } else if (file.endsWith(".wav")) {
        // WAV: cannot embed cover art; only include metadata in JSON
        console.log(`WAV file processed (metadata only): ${title} by ${artist}`);
      }

      tracklist.push({
        file: `./music/fallout76/${file}`,
        title,
        artist,
        cover: coverFile
      });

      console.log(`Processed: ${title} by ${artist}`);
    } catch (err) {
      console.error(`Error reading ${file}:`, err.message);
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(tracklist, null, 2));
  console.log(`\n✅ Metadata embedded + JSON written to ${outputFile}`);
}

processFiles();



//node generate-fallout76.cjs