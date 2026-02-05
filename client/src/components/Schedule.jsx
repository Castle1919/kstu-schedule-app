import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './Schedule.module.css';

// Константа DAYS вынесена за пределы компонента для глобальной видимости в файле
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
    const [schedule, setSchedule] = useState([]);
    const [selectedWeekType, setSelectedWeekType] = useState(initialWeekType);
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState('');
    const [currentDate, setCurrentDate] = useState('');

    const { weekNumber: currentWeekNumber, weekType: currentWeekType } = getWeekInfo();

    useEffect(() => {
        const fetchScheduleData = async () => {
            const storedUser = localStorage.getItem('username');
            const storedPass = localStorage.getItem('password');

            if (!storedUser || !storedPass) {
                navigate('/');
                return;
            }

            setUsername(storedUser);

            const options = { weekday: 'long', day: 'numeric', month: 'long' };
            const dateStr = new Date().toLocaleDateString('ru-RU', options);
            setCurrentDate(dateStr.charAt(0).toUpperCase() + dateStr.slice(1));

            try {
                setLoading(true);
                const response = await axios.post('https://kstu-schedule-app-server.vercel.app/api/schedule', {
                    username: storedUser,
                    password: storedPass
                });

                if (response.data && Array.isArray(response.data)) {
                    setSchedule(response.data);
                    localStorage.setItem('userSchedule', JSON.stringify(response.data));
                }
            } catch (err) {
                console.error("Ошибка обновления:", err);
                const cached = localStorage.getItem('userSchedule');
                if (cached) setSchedule(JSON.parse(cached));
            } finally {
                setLoading(false);
            }
        };

        fetchScheduleData();
    }, [navigate]);

    const filteredLessons = schedule.map(row =>
        row.map(day =>
            Array.isArray(day) ? day.filter(lesson =>
                lesson.type === 'all' || lesson.type === selectedWeekType
            ) : []
        )
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
            {loading ? (
                <div className={styles.loaderWrapper}>
                    <div className={styles.loader}></div>
                    <div className={styles.loadingText}>Загрузка...</div>
                </div>
            ) : (
                <>
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
                        <div className={styles.headerRight}>
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

                    <div className={styles.daysHeader}>
                        {DAYS_OF_WEEK.map((day, i) => <div key={i} className={styles.dayTitle}>{day}</div>)}
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
                                                <div key={i} className={styles.lesson}
                                                    style={activeNow ? { border: '2px solid #22c55e', backgroundColor: '#dcfce7' } : {}}>
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
                </>
            )}
        </div>
    );
}