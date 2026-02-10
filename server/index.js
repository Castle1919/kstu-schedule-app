import express from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import { login, createJarFromCookies } from './utils/auth.js';
import { getSemesterInfo, fetchSchedule, parseSchedule } from './utils/schedule.js';

const app = express();
// Уровень 3: Кэширование расписания (SWR) на 30 минут
const scheduleCache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://kstu-schedule-app-client.vercel.app'
    ],
    credentials: true
}));
app.use(express.json());

/**
 * Основная логика получения расписания
 * @param {string} username Логин
 * @param {string} password Пароль
 * @param {object} existingCookies Куки из браузера (aspxAuth, sessionId)
 */
async function getScheduleData(username, password, existingCookies = null) {
    const cacheKey = `schedule_${username}`;

    // Пытаемся взять из кэша
    const cachedData = scheduleCache.get(cacheKey);
    if (cachedData) {
        return { ...cachedData, fromCache: true };
    }

    let jar;
    let newSession = null;

    // Уровень 2: Повторное использование сессии
    if (existingCookies && existingCookies.aspxAuth) {
        jar = await createJarFromCookies(existingCookies);
        const html = await fetchSchedule(jar);
        const parsed = parseSchedule(html);

        if (parsed) {
            const info = getSemesterInfo();
            const result = {
                schedule: parsed,
                week: info.weekNumber,
                weekType: info.weekNumber % 2 === 1 ? 'numerator' : 'denominator',
                session: existingCookies // Сессия всё еще валидна
            };
            scheduleCache.set(cacheKey, result);
            return result;
        }
    }

    // Если кук нет или они протухли — идем на полный логин
    const auth = await login(username, password);
    jar = auth.jar;
    newSession = { aspxAuth: auth.aspxAuth, sessionId: auth.sessionId };

    const html = await fetchSchedule(jar);
    const parsedData = parseSchedule(html);
    const info = getSemesterInfo();

    const result = {
        schedule: parsedData || [],
        week: info.weekNumber,
        weekType: info.weekNumber % 2 === 1 ? 'numerator' : 'denominator',
        session: newSession
    };

    scheduleCache.set(cacheKey, result);
    return result;
}

// Эндпоинт для запроса расписания
app.post('/api/schedule', async (req, res) => {
    const { username, password, session } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    try {
        const result = await getScheduleData(username, password, session);
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