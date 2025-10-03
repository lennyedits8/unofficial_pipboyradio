const fs = require("fs");
const path = require("path");
const mm = require("music-metadata");

const musicFolder = path.join(__dirname, "music", "fallout3");
const coverFolder = path.join(__dirname, "covers", "fallout3");
const outputFile  = path.join(__dirname, "tracklists", "fallout3.json");

function cleanTitle(title) {
  return title
    .replace(/\s*\((album|single) version\)/ig, "")
    .replace(/\s*\(\d{4}\s*remastered\)/ig, "")
    .replace(/\s*\(remastered\s*\d{4}\)/ig, "")
    .replace(/\s*\(remastered\)/ig, "")
    .trim();
}

if (!fs.existsSync(coverFolder)) {
  fs.mkdirSync(coverFolder, { recursive: true });
}

async function processFiles() {
  const files = fs.readdirSync(musicFolder).filter(f => f.endsWith(".flac"));
  const tracklist = [];

  for (const file of files) {
    const filePath = path.join(musicFolder, file);
    try {
      const metadata = await mm.parseFile(filePath);
      let title = metadata.common.title || path.parse(file).name;
      const artist = metadata.common.artist || "Unknown Artist";

      title = cleanTitle(title);

      let coverFile = "images/default-cover.jpg";
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const picture = metadata.common.picture[0];
        const coverName = path.parse(file).name.replace(/\s+/g, "").toLowerCase() + ".jfif";
        coverFile = `./covers/fallout3/${coverName}`;
        fs.writeFileSync(path.join(coverFolder, coverName), picture.data);
      }

      tracklist.push({
        file: `./music/fallout3/${file}`,
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
  console.log(`\n✅ Metadata written to ${outputFile}`);
}

processFiles();




// run node generate-fallout3.cjs