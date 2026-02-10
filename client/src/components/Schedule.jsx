import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Schedule.module.css';

const DAYS_OF_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/**
 * Локальный расчет параметров недели (резервный вариант)
 */
function getWeekInfo() {
    const start = new Date(2026, 0, 26); // Дата начала семестра
    const now = new Date();
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), 20);
    const weekType = weekNumber % 2 === 1 ? 'numerator' : 'denominator';
    return { weekNumber, weekType };
}

const { weekType: initialWeekType } = getWeekInfo();

export default function Schedule() {
    const navigate = useNavigate();

    // Определение API URL
    const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://kstu-schedule-app-server.vercel.app';

    // Состояние темы
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

    // Применение темы
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Загрузка расписания из localStorage
    const [schedule] = useState(() => {
        const saved = localStorage.getItem('userSchedule');
        return saved ? JSON.parse(saved) : [];
    });

    const [refreshing, setRefreshing] = useState(false);
    const username = localStorage.getItem('username') || '';

    // Состояния для отображения недель
    const [selectedWeekType, setSelectedWeekType] = useState(() => localStorage.getItem('serverWeekType') || initialWeekType);
    const [currentDate, setCurrentDate] = useState({ day: '', details: '' });

    const [currentWeekNumber] = useState(() => localStorage.getItem('serverWeek') || getWeekInfo().weekNumber);
    const [currentWeekType] = useState(() => localStorage.getItem('serverWeekType') || getWeekInfo().weekType);

    useEffect(() => {
        // console.log('Загрузка страницы расписания.');

        // Проверка авторизации
        if (!localStorage.getItem('isScheduleLoaded')) {
            // console.warn('Доступ запрещен, перенаправление на логин');
            navigate('/');
            return;
        }

        // Форматирование текущей даты на русском
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        const dateStr = new Date().toLocaleDateString('ru-RU', options);
        const parts = dateStr.split(', ');

        if (parts.length === 2) {
            setCurrentDate({
                day: parts[0].charAt(0).toUpperCase() + parts[0].slice(1),
                details: parts[1]
            });
        } else {
            setCurrentDate({ day: dateStr.charAt(0).toUpperCase() + dateStr.slice(1), details: '' });
        }

        // Авто-обновление данных (раз в 6 часов)
        const lastUpdate = localStorage.getItem('lastUpdate');
        if (lastUpdate) {
            const diff = Date.now() - parseInt(lastUpdate);
            if (diff > 6 * 60 * 60 * 1000) {
                const autoRefresh = async () => {
                    const storedUser = localStorage.getItem('username');
                    const storedPass = localStorage.getItem('password');
                    if (!storedUser || !storedPass) return;

                    setRefreshing(true);
                    try {
                        const response = await axios.post(`${API_URL}/api/schedule`, {
                            username: storedUser,
                            password: storedPass
                        });
                        if (response.data && response.data.schedule) {
                            localStorage.setItem('userSchedule', JSON.stringify(response.data.schedule));
                            localStorage.setItem('lastUpdate', Date.now().toString());
                            window.location.reload();
                        }
                    } catch (err) {
                        // console.error("Ошибка авто-обновления:", err);
                    } finally {
                        setRefreshing(false);
                    }
                };
                autoRefresh();
            }
        }
    }, [navigate, schedule, API_URL]);

    // Фильтрация пар по выбранному типу недели (числитель/знаменатель)
    const filteredLessons = schedule.map((row) =>
        row.map((day) => {
            return Array.isArray(day) ? day.filter(lesson =>
                lesson.type === 'all' || lesson.type === selectedWeekType
            ) : [];
        })
    );

    // Определение индекса сегодняшнего дня (0 - Пн, 5 - Сб)
    const activeTodayIndex = (() => {
        const d = new Date().getDay();
        return d === 0 ? null : d - 1;
    })();

    const [selectedDay, setSelectedDay] = useState(activeTodayIndex !== null ? activeTodayIndex : 0);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/');
    };

    /**
     * Проверка, является ли пара текущей по времени
     */
    const isLessonActive = (timeStr) => {
        if (!timeStr) return false;
        try {
            const cleanTime = timeStr.replace(/[^\d:.-–]/g, '');
            const parts = cleanTime.split(/[-–]/);
            if (parts.length !== 2) return false;

            const now = new Date();
            const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

            const getMinutes = (s) => {
                const [h, m] = s.split(':').map(Number);
                return h * 60 + m;
            };

            return currentTotalMinutes >= getMinutes(parts[0].trim()) &&
                currentTotalMinutes < getMinutes(parts[1].trim());
        } catch (e) { return false; }
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerContainer}>
                <div className={styles.headerLeft}>
                    <div className={styles.greeting}>Привет, {username}! 👋 {refreshing && <span style={{ fontSize: '10px' }}>(обн...)</span>}</div>
                    <div className={styles.dateContainer}>
                        <span className={styles.dayName}>{currentDate.day}</span>
                        <span className={styles.dateDetails}>{currentDate.details}</span>
                    </div>
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

            {/* Табы для мобильной версии */}
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
                    // Подсветка дня только если выбранная неделя совпадает с реальной текущей
                    const isToday = dayIndex === activeTodayIndex && selectedWeekType === currentWeekType;
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

                                    const cleanSubject = (text) => {
                                        return text.replace(/Период с \d{2}\.\d{2} по \d{2}\.\d{2}/gi, '').trim();
                                    };

                                    return (
                                        <div key={i}
                                            className={`${styles.lesson} ${activeNow ? styles.activeLesson : ''}`}
                                        >
                                            <div className={styles.topInfo}>
                                                <div className={styles.time}>
                                                    {lesson.time || "Время не указано"} {activeNow && '🔥'}
                                                </div>
                                                <div className={styles.subject}>
                                                    {cleanSubject(lesson.subject)}
                                                </div>
                                            </div>
                                            <div className={styles.bottomInfo}>
                                                <div className={styles.teacher}>{lesson.teacher}</div>
                                                <div className={styles.room}>{lesson.room}</div>
                                            </div>
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