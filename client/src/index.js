import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import App from './App';
import Schedule from './components/Schedule';

const router = createBrowserRouter([
	{
		path: "/",
		element: <App />
	},
	{
		path: "schedule",
		element: <Schedule />
	},
])

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
	<RouterProvider router={router} />
);

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').then(registration => {
			console.log('SW registered: ', registration);
		}).catch(registrationError => {
			console.log('SW registration failed: ', registrationError);
		});
	});
}

