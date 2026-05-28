/**
 * High-Performance HTML5 explainer video generator helper.
 * Automatically opens the custom-tailored interactive Video Composer in your browser.
 */

const { exec } = require('child_process');
const path = require('path');

const fileUrl = 'file:///' + path.join(__dirname, 'video_composer.html').replace(/\\/g, '/');

console.log("================================================================================");
console.log("CLEAN-CORE.IO EXPLAINER VIDEO GENERATOR");
console.log("================================================================================");
console.log("-> Der interaktive Video Composer wurde erfolgreich aktualisiert!");
console.log("-> Enthält jetzt 7 Slides inklusive der neuen Landing-Page Einleitung.");
console.log("-> Features: HTML5 Stage, CSS Ken-Burns Effekte, automatische Übergänge,");
console.log("   Web Speech API Sprachausgabe und Untertitel in DE / EN / ES.");
console.log("");
console.log("Öffne den Video Composer in deinem Standard-Webbrowser...");
console.log(`URL: ${fileUrl}`);
console.log("");

// Automatically open the browser on Windows
exec(`start "" "${fileUrl}"`, (err) => {
  if (err) {
    console.log("Browser konnte nicht automatisch geöffnet werden. Bitte kopiere diese URL:");
    console.log(fileUrl);
    console.log("und füge sie manuell in Google Chrome, Edge oder Firefox ein.");
  } else {
    console.log("Der Video Composer wurde erfolgreich im Browser geöffnet!");
    console.log("Folge dort der Kurzanleitung (Button oben rechts), um dein Video aufzunehmen.");
  }
  console.log("================================================================================");
});
