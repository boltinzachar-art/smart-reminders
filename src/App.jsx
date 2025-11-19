import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { Plus, Calendar, CheckCircle, Clock, Trash2, Pause, Play, Search, ExternalLink } from 'lucide-react';

const App = () => {
  const [tasks, setTasks] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [userId, setUserId] = useState(null);

  // Форма новой задачи
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    type: 'reminder',
    frequency: 'once',
    next_run: '',
    priority: 3,
    category: '',
    action_template: null
  });

  // 1. Инициализация Телеграма
  useEffect(() => {
    if (WebApp.initDataUnsafe.user) {
      setUserId(WebApp.initDataUnsafe.user.id);
      WebApp.expand(); // Раскрываем на всю высоту
      // Настраиваем цвета хедера телеграма под приложение
      WebApp.setHeaderColor('#ffffff'); 
      WebApp.setBackgroundColor('#ffffff');
    } else {
      console.log("Режим тестирования в браузере");
      // setUserId(123456); // Для тестов
    }
  }, []);

  // 2. Загрузка задач
  useEffect(() => {
    if (userId) {
      loadTasks();
      const interval = setInterval(loadTasks, 30000);
      return () => clearInterval(interval);
    }
  }, [userId]);

  const loadTasks = async () => {
    try {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('telegram_user_id', userId)
        .order('next_run', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Ошибка загрузки:', error);
    }
  };

  const createTask = async () => {
    if (!newTask.title || !newTask.next_run) return alert('Заполни название и время');

    let template = null;
    if (newTask.type === 'email') template = { to: "", subject: newTask.title, body: newTask.description };
    if (newTask.type === 'whatsapp') template = { phone: "", message: newTask.title };
    if (newTask.type === 'web_search') template = { query: newTask.title };

    try {
      const { error } = await supabase.from('tasks').insert([{
        ...newTask,
        telegram_user_id: userId,
        status: 'active',
        action_template: template
      }]);

      if (error) throw error;

      setShowAddModal(false);
      setNewTask({ title: '', description: '', type: 'reminder', frequency: 'once', next_run: '', priority: 3, category: '', action_template: null });
      loadTasks();
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const completeTask = async (taskId, task) => {
    try {
      if (task.frequency !== 'once') {
        const nextRun = calculateNextRun(task.next_run, task.frequency);
        await supabase.from('tasks').update({
          next_run: nextRun,
          last_run: new Date().toISOString()
        }).eq('id', taskId);
      } else {
        await supabase.from('tasks').update({
          status: 'completed',
          completed: true
        }).eq('id', taskId);
      }
      await supabase.from('task_log').insert([{ task_id: taskId, status: 'completed' }]);
      loadTasks();
    } catch (error) {
      console.error('Ошибка завершения:', error);
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Удалить задачу?')) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    loadTasks();
  };

  const toggleTaskStatus = async (taskId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
    loadTasks();
  };

  const performAction = (task) => {
    const type = task.type;
    const text = encodeURIComponent(task.title + (task.description ? `\n${task.description}` : ''));
    if (type === 'email') window.open(`mailto:?subject=${encodeURIComponent(task.title)}&body=${text}`);
    if (type === 'whatsapp') window.open(`https://wa.me/?text=${text}`);
    if (type === 'web_search') window.open(`https://www.google.com/search?q=${encodeURIComponent(task.title)}`);
    if (type === 'link' && task.description) window.open(task.description);
  };

  const calculateNextRun = (currentRun, frequency) => {
    const current = new Date(currentRun);
    if (frequency === 'daily') current.setDate(current.getDate() + 1);
    if (frequency === 'weekly') current.setDate(current.getDate() + 7);
    if (frequency === 'monthly') current.setMonth(current.getMonth() + 1);
    return current.toISOString();
  };

  const getFilteredTasks = () => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    let filtered = tasks;

    if (searchQuery) {
      filtered = filtered.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    switch (filter) {
      case 'today':
        filtered = filtered.filter(t => {
          const d = new Date(t.next_run);
          return d >= todayStart && d < tomorrowStart;
        });
        break;
      case 'overdue':
        filtered = filtered.filter(t => new Date(t.next_run) < new Date() && t.status === 'active');
        break;
      case 'upcoming':
        filtered = filtered.filter(t => new Date(t.next_run) >= tomorrowStart);
        break;
    }
    return filtered;
  };

  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return isToday ? `Сегодня в ${time}` : date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getTypeIcon = (type) => {
    const icons = { reminder: '💭', email: '📧', whatsapp: '💬', link: '🔗', web_search: '🔍' };
    return icons[type] || '📋';
  };

  const getPriorityColor = (p) => {
    if (p >= 5) return 'bg-red-100 text-red-900';
    if (p === 4) return 'bg-orange-100 text-orange-900';
    return 'bg-green-100 text-green-900';
  };

  const filteredList = getFilteredTasks();
  const overdueCount = tasks.filter(t => new Date(t.next_run) < new Date() && t.status === 'active').length;

  return (
    // h-[100dvh] гарантирует, что приложение займет ровно видимую часть экрана телефона
    <div className="h-[100dvh] flex flex-col bg-white text-black font-sans">
      
      {/* === ШАПКА (Фиксированная сверху) === */}
      <div className="bg-white border-b border-gray-200 p-4 z-10">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-2xl font-black text-black">Мои задачи</h1>
            {overdueCount > 0 && <span className="text-sm text-red-600 font-bold">Просрочено: {overdueCount}</span>}
          </div>
        </div>

        {/* Поиск */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
          <input
            className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-xl text-sm text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Поиск..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Фильтры */}
        <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {['all', 'today', 'overdue', 'upcoming'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${filter === f ? 'bg-black text-white' : 'bg-gray-100 text-black border border-gray-200'}`}
            >
              {f === 'all' ? 'Все' : f === 'today' ? 'Сегодня' : f === 'overdue' ? 'Просрочено' : 'Будущие'}
            </button>
          ))}
        </div>
      </div>

      {/* === СПИСОК ЗАДАЧ (Скроллится отдельно) === */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32">
        {filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Calendar size={48} className="mb-2 opacity-20" />
            <p>Задач пока нет</p>
          </div>
        ) : (
          filteredList.map(task => (
            <div key={task.id} className={`bg-white p-4 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-gray-100 ${new Date(task.next_run) < new Date() ? 'border-l-4 border-l-red-500' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="text-2xl mt-1">{getTypeIcon(task.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-black text-lg leading-tight truncate mr-2">{task.title}</h3>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${getPriorityColor(task.priority)}`}>P{task.priority}</span>
                  </div>
                  
                  {task.description && <p className="text-gray-800 text-sm mt-1 line-clamp-2">{task.description}</p>}

                  <div className="flex items-center gap-3 mt-3 text-xs font-medium text-gray-500">
                    <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-md">
                      <Clock size={12} /> {formatDateTime(task.next_run)}
                    </span>
                    {task.frequency !== 'once' && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md">🔁 {task.frequency}</span>}
                  </div>
                </div>
              </div>

              {/* Кнопка Действия */}
              {task.type !== 'reminder' && (
                <button
                  onClick={() => performAction(task)}
                  className="mt-3 w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition shadow-sm"
                >
                  <ExternalLink size={16} /> Выполнить действие
                </button>
              )}

              {/* Кнопки управления */}
              <div className="flex justify-end gap-4 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => completeTask(task.id, task)} className="text-green-600 hover:text-green-700 flex items-center gap-1 text-sm font-medium"><CheckCircle size={18} /> Сделано</button>
                <button onClick={() => toggleTaskStatus(task.id, task.status)} className="text-blue-600 hover:text-blue-700"><Pause size={18} /></button>
                <button onClick={() => deleteTask(task.id)} className="text-red-500 hover:text-red-600"><Trash2 size={18} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* === КНОПКА ПЛЮС (Фиксирована, поднята выше) === */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-10 right-6 w-14 h-14 bg-black text-white rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center justify-center hover:bg-gray-800 active:scale-90 transition z-50"
      >
        <Plus size={28} strokeWidth={3} />
      </button>

      {/* === МОДАЛКА СОЗДАНИЯ === */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end justify-center backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto animate-slide-up pb-10">
            <h2 className="text-2xl font-black text-black mb-6">Новая задача</h2>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Название</label>
                <input
                  className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-black font-medium focus:border-black focus:outline-none transition"
                  placeholder="Что нужно сделать?"
                  value={newTask.title}
                  onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                />
              </div>

              <div>
                 <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Описание</label>
                 <textarea
                  className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl text-black focus:border-black focus:outline-none transition"
                  placeholder="Детали..."
                  rows={2}
                  value={newTask.description}
                  onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Тип</label>
                  <select className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-black font-medium" value={newTask.type} onChange={e => setNewTask({ ...newTask, type: e.target.value })}>
                    <option value="reminder">Напоминание</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="web_search">Поиск</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Повтор</label>
                  <select className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-black font-medium" value={newTask.frequency} onChange={e => setNewTask({ ...newTask, frequency: e.target.value })}>
                    <option value="once">Нет</option>
                    <option value="daily">Каждый день</option>
                    <option value="weekly">Раз в неделю</option>
                    <option value="monthly">Раз в месяц</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 ml-1 uppercase">Время</label>
                <input
                  type="datetime-local"
                  className="w-full p-3 bg-gray-50 border-2 border-gray-100 rounded-xl text-black font-medium"
                  value={newTask.next_run}
                  onChange={e => setNewTask({ ...newTask, next_run: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={createTask} className="flex-1 bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg active:scale-95 transition">
                  Создать
                </button>
                <button onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 text-black py-4 rounded-2xl font-bold text-lg active:scale-95 transition">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;