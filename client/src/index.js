import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import App from './App';
import Schedule from './components/Schedule';

// Конфигурация роутинга (путей) приложения
const router = createBrowserRouter([
	{
		path: "/",
		element: <App /> // Главная страница (логин)
	},
	{
		path: "/schedule",
		element: <Schedule /> // Страница расписания
	},
])

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>
);

// 3. РЕГИСТРАЦИЯ SERVICE WORKER 
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js')
			.then(reg => console.log('SW зарегистрирован!', reg))
			.catch(err => console.log('Ошибка при регистрации SW', err));
	});
}

