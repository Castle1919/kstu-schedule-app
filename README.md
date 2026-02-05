KSTU Schedule App
This project provides a modern web interface for viewing student schedules from the Karaganda Technical University (KSTU) Univer system. It automatically retrieves data from the university portal and presents it in a responsive layout with offline support.

Project Structure
The application consists of a React-based frontend and a Node.js backend. The backend utilizes Playwright to authenticate and extract schedule data from the university system.

Available Scripts
In the project directory, you can run:

npm start
Runs the app in the development mode. Open http://localhost:3000 to view it in your browser. The page will reload when you make changes.

npm run build
Builds the app for production to the build folder. It correctly bundles React in production mode and optimizes the build for the best performance. The build is minified and the filenames include hashes.

Features
Automatic Data Retrieval: Uses headless browser automation to fetch schedules.

Progressive Web App: Can be installed on mobile devices and desktops.

Theme Support: Includes light and dark mode functionality.

Offline Access: Implements Service Workers to cache schedule data.

Week Detection: Automatically calculates numerator and denominator weeks.

Deployment
The project is configured for deployment on Vercel.

Backend Configuration
The server-side component requires specific configurations in vercel.json to handle the browser execution environment and CORS headers for the client.

Frontend Configuration
The client-side uses React Router for navigation and requires a rewrite rule to index.html to support direct URL access to subpages like /schedule.

Security
User credentials are not stored on the server. Login information is used solely for the duration of the scraping session and is stored in the local browser storage to facilitate automatic data refreshes.

Authors
WildMaks456 and Castle1919