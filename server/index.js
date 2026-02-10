import express from 'express';
import cors from 'cors';
import { login } from './utils/auth.js';
import { getSemesterInfo, fetchSchedule, parseSchedule } from './utils/schedule.js';

const app = express();

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://kstu-schedule-app-client.vercel.app'
    ],
    credentials: true
}));
app.use(express.json());

// Основная функция для получения расписания
async function getSchedule(username, password) {
    // console.log(`\n[!] Начинаем загрузку для: ${username}`);

    try {
        // 1. Логин и получение кук
        const { jar } = await login(username, password);

        // 2. Получение HTML страницы
        const html = await fetchSchedule(jar);

        // 3. Парсинг содержимого
        const parsedData = parseSchedule(html);

        const info = getSemesterInfo();

        return {
            schedule: parsedData,
            week: info.weekNumber,
            weekType: info.weekNumber % 2 === 1 ? 'numerator' : 'denominator'
        };
    } catch (err) {
        // console.error('!!! ОШИБКА ПРИ ПОЛУЧЕНИИ:', err.message);
        throw err;
    }
}

// Эндпоинт для запроса расписания
app.post('/api/schedule', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    try {
        const result = await getSchedule(username, password);
        res.json(result);
    } catch (error) {
        if (error.message === 'Invalid login or password') {
            res.status(401).json({ error: 'Неверный логин или пароль' });
        } else {
            // console.error('[API Error]', error);
            res.status(500).json({ error: 'Внутренняя ошибка сервера' });
        }
    }
});

// Настройки для локального запуска
const isMain = process.argv[1] && (
    process.argv[1].endsWith('index.js') ||
    process.argv[1].endsWith('index')
);

if (process.env.NODE_ENV !== 'production' && isMain) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        // console.log(`Бэкенд запущен на порту ${PORT}`)
    });
}

export default app;