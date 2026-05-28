# Clean-Core.io — Premium Open Source Desktop Client & Platform

Clean-Core.io is a modern, high-performance, and secure web and desktop application designed to streamline SAP ABAP legacy migrations to TypeScript/Node.js, offering interactive solution design modeling, modular code transformation sandboxes, and enterprise-grade GDPR (DSGVO) compliance.

---

## 🌟 Key Features

*   **Legacy-to-Modern AI Transformation:** Modular code translation from SAP ABAP to structured Node.js/TypeScript code using Google Gemini.
*   **Architectural Solution Design:** Interactive visual representation of API endpoints, side-by-side target files, and automated Cloud Run/Firestore setup.
*   **BYOK (Bring Your Own Key):** Secure client-side Gemini API testing, saving, and testing proxies to run custom developer models.
*   **GDPR / DSGVO Readiness:** Integrated deep Danger Zone with full-cascade data deletion (users, requests, projects, custom snippets, and Firebase authentication keys) and legal onboarding notices.
*   **Frosted-glass Premium Design:** Dynamic HSL-tailored slate and emerald background meshes, particle streams, and scrolling key reveals.
*   **Premium Electron Desktop App:** Fully borderless desktop wrapper with local dev syncing and secure environment containment.

---

## 📦 Tech Stack

*   **Framework:** Next.js (React 19)
*   **Desktop Shell:** Electron (v30.0.0) with context isolation and secure sandboxing
*   **Database:** Firestore & Firebase Auth
*   **Styling:** CSS & TailwindCSS (configured via postcss)
*   **Animations:** Framer Motion (motion/react)

---

## 🚀 Local Development Setup

### Prerequisites
*   Node.js (v18 or higher recommended)
*   npm or yarn

### Installation
1. Clone the repository and navigate to the directory:
   ```bash
   git clone https://github.com/your-org/clean-core.git
   cd clean-core
   ```
2. Install all open-source dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables by copying `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in your `GEMINI_API_KEY` and other standard Firebase credentials in `.env` (or configure them in-app via the BYOK Settings panel).

### Running the Web Application
Launch the local Next.js dev server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to inspect the application.

---

## 🖥️ Desktop App Compilation (Electron)

Clean-Core includes a premium Electron shell configured with borderless window structures and native OS controls for a modern desktop experience.

### Run in Desktop Development Mode
To launch the Next.js local server and Electron wrapper concurrently in development mode:
```bash
npm run electron:dev
```

### Pack the Desktop Application
To compile Next.js static files and package the Electron wrapper into a runnable local folder matching your current platform:
```bash
npm run electron:pack
```
This generates a runnable output inside the `dist/` directory.

### Build Production Installers (Open Source Release)
To build distributable installers (e.g., NSIS `.exe` on Windows, `.dmg` on macOS, `.AppImage`/`.deb` on Linux):
```bash
npm run electron:dist
```
The compiled binaries will be output inside the `dist/` folder.

---

## 🔒 Security & Privacy (DSGVO / GDPR)

Clean-Core.io is designed with strict data privacy guidelines:
*   **Context Isolation:** Electron renderer process runs in complete isolation with `nodeIntegration` disabled to prevent unsafe remote script executions.
*   **Danger Zone Account Deletion:** Users can request complete, recursive erasure directly from their settings panel. This safely purges user profiles, project blueprints, test sandboxes, ABAP uploads, and original Firebase authentication credentials in a secure transactional cascade.
*   **BYOK Storage:** Gemini keys are stored in encrypted environments or under Firestore security guidelines and can be purged instantly by the user.

---

## 📄 License

This project is licensed under the MIT License — completely open source and free for development use. Feel free to fork, contribute, and build amazing clean architecture templates.
