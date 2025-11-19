import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { Plus, Calendar, Clock, Trash2, Search, ExternalLink, RefreshCw, ChevronRight } from 'lucide-react';

const App = () => {
  const [tasks, setTasks] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userId, setUserId] = useState(null);

  // Состояние для новой задачи
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    type: 'reminder',
    frequency: 'once',
    next_run: '',
    priority: 3
  });

  // 1. Инициализация + Определение Часового Пояса
  useEffect(() => {
    const initApp = async () => {
      let currentUserId;

      if (WebApp.initDataUnsafe.user) {
        currentUserId = WebApp.initDataUnsafe.user.id;
        WebApp.expand();
        WebApp.enableClosingConfirmation();
        WebApp.setHeaderColor('#F2F2F7'); 
        WebApp.setBackgroundColor('#F2F2F7');
      } else {
        console.log("Browser Test Mode: ID 777");
        currentUserId = 777;
      }

      setUserId(currentUserId);

      // === МАГИЯ ЧАСОВЫХ ПОЯСОВ ===
      // Определяем зону телефона (например "Europe/Moscow")
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log('User Timezone:', userTimezone);

      // Сохраняем в базу, чтобы бот знал, где мы
      if (currentUserId) {
        await supabase.from('user_profiles').upsert({
          telegram_user_id: currentUserId,
          timezone: userTimezone,
          updated_at: new Date().toISOString()
        });
      }
    };

    initApp();
  }, []);

  // 2. Загрузка задач
  useEffect(() => {
    if (userId) {
      loadTasks();
      const interval = setInterval(loadTasks, 60000);
      return () => clearInterval(interval);
    }
  }, [userId]);

  const loadTasks = async () => {
    try {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('telegram_user_id', userId)
        .eq('completed', false)
        .order('next_run', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading:', error);
    }
  };

  // === СОЗДАНИЕ (ТЕПЕРЬ БЕЗ UTC) ===
  const createTask = async () => {
    if (!newTask.title) return alert('Введите название');
    
    // ВАЖНО: Мы больше НЕ конвертируем в UTC. 
    // Мы отправляем время "как есть" на часах пользователя.
    // База сама сравнит его с локальным временем юзера.
    const runTime = newTask.next_run || new Date().toISOString().slice(0, 16); 

    let template = null;
    if (newTask.type === 'email') template = { to: "", subject: newTask.title, body: newTask.description };
    if (newTask.type === 'whatsapp') template = { phone: "", message: newTask.title };
    if (newTask.type === 'web_search') template = { query: newTask.title };

    const optimisticTask = {
      ...newTask,
      next_run: runTime, 
      telegram_user_id: userId,
      status: 'active',
      completed: false,
      action_template: template,
      id: 'temp-' + Date.now() 
    };

    setTasks(prev => [...prev, optimisticTask]);
    setShowAddModal(false);
    setNewTask({ title: '', description: '', type: 'reminder', frequency: 'once', next_run: '', priority: 3 });

    const { id, ...taskForDb } = optimisticTask;

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([ taskForDb ])
        .select();

      if (error) throw error;
      if (data) {
        setTasks(prev => prev.map(t => t.id === optimisticTask.id ? data[0] : t));
      }
    } catch (error) {
      alert('Ошибка: ' + error.message);
      loadTasks();
    }
  };

  // === ВЫПОЛНЕНИЕ ===
  const completeTask = async (task) => {
    const isRecurring = task.frequency !== 'once';

    setTasks(current => current.map(t => {
      if (t.id === task.id) {
         if (isRecurring) {
            return { ...t, next_run: calculateNextRun(t.next_run, t.frequency) };
         } else {
            return { ...t, completed: true };
         }
      }
      return t;
    }));

    if (!isRecurring) {
        setTimeout(() => {
            setTasks(current => current.filter(t => t.id !== task.id));
        }, 300);
    }

    try {
      if (isRecurring) {
        const nextRun = calculateNextRun(task.next_run, task.frequency);
        await supabase.from('tasks').update({ next_run: nextRun }).eq('id', task.id);
      } else {
        await supabase.from('tasks').update({ completed: true, status: 'completed' }).eq('id', task.id);
      }
      await supabase.from('task_log').insert([{ task_id: task.id, status: 'completed' }]);
    } catch (error) {
      console.error('Ошибка:', error);
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Удалить задачу?')) return;
    setTasks(curr => curr.filter(t => t.id !== taskId));
    await supabase.from('tasks').delete().eq('id', taskId);
  };

  // === ВСПОМОГАТЕЛЬНЫЕ ===
  const calculateNextRun = (currentRun, frequency) => {
    // Работаем с датой как со строкой/локальным временем, чтобы не было сдвигов UTC
    const date = new Date(currentRun);
    
    if (frequency === 'daily') date.setDate(date.getDate() + 1);
    if (frequency === 'weekly') date.setDate(date.getDate() + 7);
    if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
    
    // Возвращаем в формате локальной строки для инпута (YYYY-MM-DDTHH:mm)
    // Небольшой хак для сохранения локального времени без Z
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };

  const performAction = (task) => {
    const text = encodeURIComponent(task.title + (task.description ? `\n${task.description}` : ''));
    if (task.type === 'email') window.open(`mailto:?subject=${encodeURIComponent(task.title)}&body=${text}`);
    if (task.type === 'whatsapp') window.open(`https://wa.me/?text=${text}`);
    if (task.type === 'web_search') window.open(`https://www.google.com/search?q=${encodeURIComponent(task.title)}`);
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    if (searchQuery) filtered = filtered.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));

    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    switch (filter) {
      case 'today':
        return filtered.filter(t => {
          const d = new Date(t.next_run);
          return d >= todayStart && d < tomorrowStart;
        });
      case 'upcoming':
        return filtered.filter(t => new Date(t.next_run) >= tomorrowStart);
      case 'overdue':
        // Для просроченных сравниваем просто строки времени, так как next_run теперь локальное
        return filtered.filter(t => new Date(t.next_run) < new Date() && !t.completed);
      default:
        return filtered;
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + time;
  };

  const isOverdue = (dateStr) => new Date(dateStr) < new Date();
  const filteredList = getFilteredTasks();
  const overdueCount = tasks.filter(t => isOverdue(t.next_run)).length;

  return (
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-[#F2F2F7] text-black font-sans flex flex-col">
      {/* ШАПКА */}
      <div className="w-full px-4 pt-14 pb-2 bg-[#F2F2F7] sticky top-0 z-20">
        <div className="flex justify-between items-end mb-3">
           <h1 className="text-3xl font-bold text-black tracking-tight ml-1">Напоминания</h1>
           {overdueCount > 0 && <span className="text-red-500 font-semibold text-sm bg-white px-2 py-1 rounded-lg shadow-sm">{overdueCount}</span>}
        </div>
        <div className="relative mb-4 w-full">
          <Search className="absolute left-3 top-2 text-gray-400" size={18} />
          <input
            className="w-full pl-9 pr-4 py-2 bg-[#E3E3E8] rounded-xl text-base text-black placeholder-gray-500 focus:outline-none focus:bg-white transition-colors"
            placeholder="Поиск"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="w-full overflow-x-auto hide-scrollbar">
           <div className="flex gap-2 pb-2">
             {['all', 'today', 'upcoming'].map(f => (
               <button
                 key={f}
                 onClick={() => setFilter(f)}
                 className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${filter === f ? 'bg-black text-white' : 'bg-white text-gray-600 shadow-sm'}`}
               >
                 {f === 'all' ? 'Все' : f === 'today' ? 'Сегодня' : 'Будущие'}
               </button>
             ))}
           </div>
        </div>
      </div>

      {/* СПИСОК */}
      <div className="flex-1 w-full px-4 pb-32 space-y-3">
        {filteredList.length === 0 ? (
           <div className="text-center py-20 text-gray-400"><p>Нет напоминаний</p></div>
        ) : (
          filteredList.map(task => (
            <div key={task.id} className="group w-full max-w-full bg-white rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-start gap-3 transition-all active:scale-[0.99]">
               <button onClick={() => completeTask(task)} className="mt-1 shrink-0 w-[22px] h-[22px] rounded-full border-2 border-gray-300 hover:border-blue-500 focus:outline-none transition-colors"/>
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <span className={`text-[17px] leading-tight break-words ${task.completed ? 'line-through text-gray-400' : 'text-black'}`}>{task.title}</span>
                  </div>
                  {task.description && <p className="text-gray-500 text-[15px] mt-0.5 line-clamp-2 leading-snug break-words">{task.description}</p>}
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                     <span className={`text-xs font-medium ${isOverdue(task.next_run) ? 'text-red-500' : 'text-gray-400'}`}>{formatTime(task.next_run)}</span>
                     {task.frequency !== 'once' && <span className="text-gray-400 flex items-center text-xs gap-0.5"><RefreshCw size={10} /> {task.frequency}</span>}
                     {task.type !== 'reminder' && (
                        <button onClick={(e) => { e.stopPropagation(); performAction(task); }} className="ml-auto text-blue-600 text-xs font-medium flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded"><ExternalLink size={10}/> {task.type}</button>
                     )}
                  </div>
               </div>
               <button onClick={() => deleteTask(task.id)} className="shrink-0 text-gray-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
            </div>
          ))
        )}
      </div>

      {/* КНОПКА И МОДАЛКА */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/90 backdrop-blur-md border-t border-gray-200 flex justify-between items-center z-30">
         <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 text-blue-600 font-bold text-lg active:opacity-70 transition">
            <div className="bg-blue-600 text-white rounded-full p-1"><Plus size={22} strokeWidth={3} /></div>
            Новое напоминание
         </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl p-4 animate-slide-up max-h-[90vh] overflow-y-auto shadow-2xl">
              <div className="flex justify-between items-center mb-4 px-2">
                 <button onClick={() => setShowAddModal(false)} className="text-blue-600 text-[17px]">Отмена</button>
                 <h3 className="font-bold text-black text-[17px]">Новое</h3>
                 <button onClick={createTask} className="text-blue-600 font-bold text-[17px]">Добавить</button>
              </div>
              <div className="bg-white rounded-xl overflow-hidden mb-6 shadow-sm">
                 <input className="w-full p-4 bg-white text-[17px] border-b border-gray-100 focus:outline-none text-black placeholder-gray-400" placeholder="Название" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} autoFocus />
                 <textarea className="w-full p-4 bg-white text-[17px] focus:outline-none resize-none h-24 text-black placeholder-gray-400" placeholder="Заметки" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
              </div>
              <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-200">
                 <div className="bg-white p-3.5 flex justify-between items-center">
                    <span className="text-black text-[17px]">Дата и время</span>
                    <input type="datetime-local" className="bg-[#F2F2F7] text-black rounded-md p-1 text-[15px] outline-none" value={newTask.next_run} onChange={e => setNewTask({...newTask, next_run: e.target.value})} />
                 </div>
                 <div className="bg-white p-3.5 flex justify-between items-center relative">
                    <span className="text-black text-[17px]">Тип действия</span>
                    <div className="flex items-center gap-1">
                        <select className="appearance-none bg-transparent text-blue-600 text-[17px] text-right outline-none pr-4 z-10 relative" value={newTask.type} onChange={e => setNewTask({...newTask, type: e.target.value})}>
                           <option value="reminder">Нет</option>
                           <option value="email">Email</option>
                           <option value="whatsapp">WhatsApp</option>
                           <option value="web_search">Поиск</option>
                        </select>
                        <ChevronRight size={16} className="text-gray-300 absolute right-0" />
                    </div>
                 </div>
                 <div className="bg-white p-3.5 flex justify-between items-center relative">
                    <span className="text-black text-[17px]">Повтор</span>
                    <div className="flex items-center gap-1">
                        <select className="appearance-none bg-transparent text-blue-600 text-[17px] text-right outline-none pr-4 z-10 relative" value={newTask.frequency} onChange={e => setNewTask({...newTask, frequency: e.target.value})}>
                           <option value="once">Никогда</option>
                           <option value="daily">Ежедневно</option>
                           <option value="weekly">Еженедельно</option>
                           <option value="monthly">Ежемесячно</option>
                        </select>
                        <ChevronRight size={16} className="text-gray-300 absolute right-0" />
                    </div>
                 </div>
              </div>
              <div className="h-6"></div> 
           </div>
        </div>
      )}
    </div>
  );
};

export default App;