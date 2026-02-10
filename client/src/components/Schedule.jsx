import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Schedule.module.css';

const DAYS_OF_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

/**
 * Резервный расчет недели
 */
function getWeekInfo() {
    const start = new Date(2026, 0, 26);
    const now = new Date();
    const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.min(Math.max(Math.floor(diffDays / 7) + 1, 1), 20);
    const weekType = weekNumber % 2 === 1 ? 'numerator' : 'denominator';
    return { weekNumber, weekType };
}

export default function Schedule() {
    const navigate = useNavigate();

    const API_URL = window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://kstu-schedule-app-server.vercel.app';

    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
    const [schedule, setSchedule] = useState(() => JSON.parse(localStorage.getItem('userSchedule') || '[]'));
    const [refreshing, setRefreshing] = useState(false);
    const [selectedWeekType, setSelectedWeekType] = useState(() => localStorage.getItem('serverWeekType') || getWeekInfo().weekType);
    const [currentDate, setCurrentDate] = useState({ day: '', details: '' });
    const [currentWeekNumber] = useState(() => localStorage.getItem('serverWeek') || getWeekInfo().weekNumber);
    const [currentWeekType] = useState(() => localStorage.getItem('serverWeekType') || getWeekInfo().weekType);

    const user = localStorage.getItem('username') || '';

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    useEffect(() => {
        if (!localStorage.getItem('isScheduleLoaded')) {
            navigate('/');
            return;
        }

        // Дата
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        const dateStr = new Date().toLocaleDateString('ru-RU', options);
        const parts = dateStr.split(', ');
        if (parts.length === 2) {
            setCurrentDate({ day: parts[0].charAt(0).toUpperCase() + parts[0].slice(1), details: parts[1] });
        } else {
            setCurrentDate({ day: dateStr.charAt(0).toUpperCase() + dateStr.slice(1), details: '' });
        }

        // Авто-обновление или проверка сессии
        const checkAndRefresh = async () => {
            const lastUpdate = localStorage.getItem('lastUpdate');
            const diff = Date.now() - parseInt(lastUpdate || '0');

            // Если прошло больше часа, обновляем тихо в фоне (SWR)
            if (diff > 60 * 60 * 1000) {
                const user = localStorage.getItem('username');
                const pass = localStorage.getItem('password');
                const session = JSON.parse(localStorage.getItem('userSession') || 'null');

                if (!user || !pass) return;

                setRefreshing(true);
                try {
                    const res = await axios.post(`${API_URL}/api/schedule`, { username: user, password: pass, session });
                    if (res.data && res.data.schedule) {
                        setSchedule(res.data.schedule);
                        localStorage.setItem('userSchedule', JSON.stringify(res.data.schedule));
                        localStorage.setItem('lastUpdate', Date.now().toString());
                        if (res.data.session) {
                            localStorage.setItem('userSession', JSON.stringify(res.data.session));
                        }
                    }
                } catch (e) {
                    // console.error(e);
                } finally {
                    setRefreshing(false);
                }
            }
        };

        checkAndRefresh();
    }, [navigate, API_URL]);

    const filteredLessons = schedule.map((row) =>
        row.map((day) => Array.isArray(day) ? day.filter(l => l.type === 'all' || l.type === selectedWeekType) : [])
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
            // Поддержка всех видов тире: -, –, —
            const cleanTime = timeStr.replace(/\s+/g, '');
            const parts = cleanTime.split(/[-–—]/);
            if (parts.length !== 2) return false;

            const now = new Date();
            const curr = now.getHours() * 60 + now.getMinutes();

            const getM = (s) => {
                const [h, m] = s.replace('.', ':').split(':').map(Number);
                return h * 60 + m;
            };

            const startM = getM(parts[0]);
            const endM = getM(parts[1]);

            return curr >= startM && curr < endM;
        } catch (e) { return false; }
    };

    // Компонент Skeleton для пар
    const SkeletonCard = () => (
        <div className={`${styles.lesson} ${styles.skeleton} ${styles.skeletonLesson}`}>
            <div style={{ height: '20px', width: '40%', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', marginBottom: '8px' }}></div>
            <div style={{ height: '24px', width: '90%', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}></div>
        </div>
    );

    return (
        <div className={styles.container}>
            <div className={styles.headerContainer}>
                <div className={styles.headerLeft}>
                    <div className={styles.greeting}>Привет, {user}! 👋 {refreshing && <span style={{ fontSize: '10px' }}>(обн...)</span>}</div>
                    <div className={styles.dateContainer}>
                        <span className={styles.dayName}>{currentDate.day}</span>
                        <span className={styles.dateDetails}>{currentDate.details}</span>
                    </div>
                </div>
                <div className={styles.headerCenter}>
                    <div className={styles.weekNumber}>Неделя {currentWeekNumber}</div>
                    <div className={styles.weekType}>{currentWeekType === 'numerator' ? 'Числитель' : 'Знаменатель'}</div>
                </div>
                <div className={styles.headerRight} style={{ display: 'flex', alignItems: 'center' }}>
                    <div className={styles.themeToggle} onClick={toggleTheme} title="Тема">
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

            {/* Заголовки для десктопа */}
            <div className={styles.daysHeader}>
                {DAYS_OF_WEEK.map((day, idx) => (
                    <div key={idx} className={styles.dayTitle}>{day}</div>
                ))}
            </div>

            {/* Табы для мобилки */}
            <div className={styles.mobileTabs}>
                {DAYS_OF_WEEK.map((day, idx) => (
                    <div key={idx} className={`${styles.mobileTab} ${selectedDay === idx ? styles.activeTab : ''}`}
                        onClick={() => setSelectedDay(idx)}>{day}</div>
                ))}
            </div>

            <div className={styles.grid}>
                {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                    const dayLessons = filteredLessons.map(row => row[dayIndex] || []).flat();
                    const isToday = dayIndex === activeTodayIndex && selectedWeekType === currentWeekType;
                    const isColumnVisible = dayIndex === selectedDay;

                    return (
                        <div key={dayIndex} className={`${styles.dayColumn} ${isToday ? styles.today : ''} ${isColumnVisible ? styles.mobileVisible : ''}`}>
                            {/* <div className={styles.mobileDayTitle}>{dayName}</div> */}

                            {refreshing && dayLessons.length === 0 ? (
                                <>
                                    <SkeletonCard />
                                    <SkeletonCard />
                                    <SkeletonCard />
                                </>
                            ) : dayLessons.length === 0 ? (
                                <div className={styles.noLessons}>Пар нет</div>
                            ) : (
                                dayLessons.map((lesson, i) => {
                                    const activeNow = isToday && isLessonActive(lesson.time);
                                    return (
                                        <div key={i} className={`${styles.lesson} ${activeNow ? styles.activeLesson : ''}`}>
                                            <div className={styles.topInfo}>
                                                <div className={styles.time}>{lesson.time || "---"} {activeNow && '🔥'}</div>
                                                <div className={styles.subject}>{lesson.subject}</div>
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