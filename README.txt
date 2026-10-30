COMPASS MI Coach v1.9 — Netlify package

CONTENTS
- index.html: the complete static web app. CSS and JavaScript are included in this file.
- netlify.toml: sets the site publish directory to this folder. No build command or dependencies are required.

DEPLOYMENT
Deploy this folder as a static site with Netlify, or connect a Git repository containing these files. The publish directory is the folder containing index.html. There is no build step.

DESIGN BOUNDARY
The coach follows a structured, rule-based flow. It does not use NLP, interpret free-text responses, or infer a user's intended meaning. It uses fixed choices, numeric ratings, Yes/No checks, and participant-written responses. Free-text responses are displayed and included in the transcript verbatim.

PRIVACY
The app has no server-side session storage, analytics, sign-in, or external scripts. Session data exists in the current page only. If the participant downloads the transcript, the downloaded file may contain health information and should be handled accordingly. Avoid entering names or other identifying information.

SCOPE
This is a prototype and is not a clinical or emergency service. It does not interpret glucose readings, set clinical targets, or recommend medication or treatment changes. The safety phrase screen is limited and can miss or misclassify concerns; it must not be relied on as the only safety control.
