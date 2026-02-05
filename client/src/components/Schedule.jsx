import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Schedule.module.css';

const DAYS_OF_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function getWeekInfo() {
    const start = new Date(2026, 0, 26);
    const now = new Date();
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    const weekType = weekNumber % 2 === 1 ? 'numerator' : 'denominator';
    return { weekNumber, weekType };
}

const { weekType: initialWeekType } = getWeekInfo();

export default function Schedule() {
    const navigate = useNavigate();

    // Тема
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Состояние данных
    const [schedule, setSchedule] = useState(() => {
        const saved = localStorage.getItem('userSchedule');
        return saved ? JSON.parse(saved) : [];
    });

    const [refreshing, setRefreshing] = useState(false);
    const username = localStorage.getItem('username') || '';
    const password = localStorage.getItem('password') || '';

    const [selectedWeekType, setSelectedWeekType] = useState(initialWeekType);
    const [currentDate, setCurrentDate] = useState('');

    const { weekNumber: currentWeekNumber, weekType: currentWeekType } = getWeekInfo();
    useEffect(() => {
        if (!schedule || schedule.length === 0) {
            navigate('/');
            return;
        }

        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        const dateStr = new Date().toLocaleDateString('ru-RU', options);
        setCurrentDate(dateStr.charAt(0).toUpperCase() + dateStr.slice(1));

        // Авто-обновление если прошло больше 6 часов
        const lastUpdate = localStorage.getItem('lastUpdate');
        if (lastUpdate) {
            const diff = Date.now() - parseInt(lastUpdate);
            if (diff > 6 * 60 * 60 * 1000) {
                console.log('Данные устарели, запускаю авто-обновление...');

                // Чтобы ESLint не ругался, вызываем логику обновления напрямую
                const autoRefresh = async () => {
                    const storedUser = localStorage.getItem('username');
                    const storedPass = localStorage.getItem('password');
                    if (!storedUser || !storedPass) return;

                    try {
                        const response = await axios.post('https://kstu-schedule-app-server.vercel.app/api/schedule', {
                            username: storedUser,
                            password: storedPass
                        });
                        if (response.data) {
                            localStorage.setItem('userSchedule', JSON.stringify(response.data));
                            localStorage.setItem('lastUpdate', Date.now().toString());
                            window.location.reload();
                        }
                    } catch (err) {
                        console.error("Авто-обновление не удалось:", err);
                    }
                };

                autoRefresh();
            }
        }
    }, [navigate, schedule]);


    const filteredLessons = schedule.map((row) =>
        row.map((day) => {
            return Array.isArray(day) ? day.filter(lesson =>
                lesson.type === 'all' || lesson.type === selectedWeekType
            ) : [];
        })
    );

    const activeTodayIndex = (() => {
        const d = new Date().getDay();
        return d === 0 ? null : d - 1;
    })();

    const [selectedDay, setSelectedDay] = useState(activeTodayIndex !== null ? activeTodayIndex : 0);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    const isLessonActive = (timeStr) => {
        if (!timeStr) return false;
        try {
            const parts = timeStr.split(/[-–]/);
            if (parts.length !== 2) return false;
            const now = new Date();
            const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
            const getMinutes = (s) => {
                const [h, m] = s.split(':').map(Number);
                return h * 60 + m;
            };
            return currentTotalMinutes >= getMinutes(parts[0].trim()) && currentTotalMinutes < getMinutes(parts[1].trim());
        } catch (e) { return false; }
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerContainer}>
                <div className={styles.headerLeft}>
                    <div className={styles.greeting}>Привет, {username}! 👋</div>
                    <div className={styles.date}>{currentDate}</div>
                </div>
                <div className={styles.headerCenter}>
                    <div className={styles.weekNumber}>Неделя {currentWeekNumber}</div>
                    <div className={styles.weekType}>
                        {currentWeekType === 'numerator' ? 'Числитель' : 'Знаменатель'}
                    </div>
                </div>
                <div className={styles.headerRight} style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={styles.themeToggle} onClick={toggleTheme} title="Переключить тему">
                        <span className={styles.toggleIcon}>{theme === 'light' ? '🌙' : '☀️'}</span>
                    </div>
                    <button onClick={handleLogout} className={styles.logoutBtn}>Выйти</button>
                </div>
            </div>

            <div className={styles.switch}>
                <div className={`${styles.tab} ${selectedWeekType === 'numerator' ? styles.active : ''}`}
                    onClick={() => setSelectedWeekType('numerator')}>Числитель</div>
                <div className={`${styles.tab} ${selectedWeekType === 'denominator' ? styles.active : ''}`}
                    onClick={() => setSelectedWeekType('denominator')}>Знаменатель</div>
                <div className={styles.slider}></div>
            </div>

            <div className={styles.mobileTabs}>
                {DAYS_OF_WEEK.map((day, idx) => (
                    <div key={idx}
                        className={`${styles.mobileTab} ${selectedDay === idx ? styles.activeTab : ''}`}
                        onClick={() => setSelectedDay(idx)}>{day}</div>
                ))}
            </div>

            <div className={styles.grid}>
                {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                    const dayLessons = filteredLessons.map(row => row[dayIndex] || []).flat();
                    const isToday = dayIndex === activeTodayIndex;
                    const isColumnVisible = dayIndex === selectedDay;

                    return (
                        <div key={dayIndex}
                            className={`${styles.dayColumn} ${isToday ? styles.today : ''} ${isColumnVisible ? styles.mobileVisible : ''}`}>
                            <div className={styles.mobileDayTitle}>{dayName}</div>

                            {dayLessons.length === 0 ? (
                                <div className={styles.noLessons}>Пар нет</div>
                            ) : (
                                dayLessons.map((lesson, i) => {
                                    const activeNow = isToday && isLessonActive(lesson.time);
                                    return (
                                        <div key={i}
                                            className={`${styles.lesson} ${activeNow ? styles.activeLesson : ''}`}
                                        >
                                            <div className={styles.time}>
                                                {lesson.time || "Время не указано"} {activeNow && '🔥'}
                                            </div>
                                            <div className={styles.subject}>{lesson.subject}</div>
                                            <div className={styles.teacher}>{lesson.teacher}</div>
                                            <div className={styles.room}>{lesson.room}</div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}