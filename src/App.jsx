import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Исправлен путь
import WebApp from '@twa-dev/sdk'; // Исправлен импорт
import { Plus, Calendar, CheckCircle, Clock, Trash2, Play, Pause, Search, ExternalLink } from 'lucide-react';

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
      WebApp.expand();
    } else {
      // Для тестов в браузере
      console.log("Режим тестирования в браузере");
      // setUserId(123456); // Раскомментируй для теста в браузере
    }
  }, []);

  // 2. Загрузка задач при появлении userId
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
        .eq('telegram_user_id', userId) // БЕРЕМ ТОЛЬКО ЗАДАЧИ ЭТОГО ЮЗЕРА
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

    // Простая генерация шаблона действия
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
      // Логика повторения
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
      
      // Лог
      await supabase.from('task_log').insert([{ 
          task_id: taskId, 
          status: 'completed' 
      }]);
      
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

  // === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

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
    const todayStart = new Date(now.setHours(0,0,0,0));
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
    if (p >= 5) return 'bg-red-100 text-red-800';
    if (p === 4) return 'bg-orange-100 text-orange-800';
    return 'bg-green-100 text-green-800';
  };

  const filteredList = getFilteredTasks();
  const overdueCount = tasks.filter(t => new Date(t.next_run) < new Date() && t.status === 'active').length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-20">
      {/* Шапка */}
      <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <div>
             <h1 className="text-2xl font-bold text-gray-900">Мои задачи</h1>
             {overdueCount > 0 && <span className="text-xs text-red-600 font-bold">Просрочено: {overdueCount}</span>}
          </div>
          <button onClick={() => setShowAddModal(true)} className="bg-blue-600 text-white p-2 rounded-full shadow hover:bg-blue-700">
            <Plus size={24} />
          </button>
        </div>

        {/* Поиск */}
        <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
        </div>

        {/* Фильтры */}
        <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
          {['all', 'today', 'overdue', 'upcoming'].map(f => (
             <button 
               key={f}
               onClick={() => setFilter(f)}
               className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition ${filter === f ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`}
             >
               {f === 'all' ? 'Все' : f === 'today' ? 'Сегодня' : f === 'overdue' ? 'Просрочено' : 'Будущие'}
             </button>
          ))}
        </div>
      </div>

      {/* Список задач */}
      <div className="p-4 space-y-3">
        {filteredList.length === 0 ? (
           <div className="text-center py-10 text-gray-400">Нет задач</div>
        ) : (
           filteredList.map(task => (
             <div key={task.id} className={`bg-white p-4 rounded-xl shadow-sm border-l-4 ${new Date(task.next_run) < new Date() ? 'border-l-red-500' : 'border-l-blue-500'}`}>
                <div className="flex items-start gap-3">
                   <div className="text-2xl">{getTypeIcon(task.type)}</div>
                   <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                         <h3 className="font-semibold text-gray-900 truncate">{task.title}</h3>
                         <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getPriorityColor(task.priority)}`}>P{task.priority}</span>
                      </div>
                      {task.description && <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{task.description}</p>}
                      
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                         <Clock size={12} /> {formatDateTime(task.next_run)}
                         {task.frequency !== 'once' && <span className="bg-gray-100 px-1 rounded">🔁 {task.frequency}</span>}
                      </div>
                   </div>
                </div>

                {/* Кнопка Действия */}
                {task.type !== 'reminder' && (
                    <button 
                      onClick={() => performAction(task)}
                      className="mt-3 w-full py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-blue-100 active:scale-95 transition"
                    >
                      <ExternalLink size={16}/> Выполнить действие
                    </button>
                )}

                {/* Кнопки управления */}
                <div className="flex justify-end gap-4 mt-3 pt-2 border-t border-gray-50">
                   <button onClick={() => completeTask(task.id, task)} className="text-green-600 hover:text-green-700 flex items-center gap-1 text-sm"><CheckCircle size={18}/> Сделано</button>
                   <button onClick={() => toggleTaskStatus(task.id, task.status)} className="text-blue-400 hover:text-blue-500"><Pause size={18}/></button>
                   <button onClick={() => deleteTask(task.id)} className="text-red-400 hover:text-red-500"><Trash2 size={18}/></button>
                </div>
             </div>
           ))
        )}
      </div>

      {/* Модалка создания */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm">
           <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[85vh] overflow-y-auto animate-slide-up">
              <h2 className="text-xl font-bold mb-4">Новая задача</h2>
              
              <div className="space-y-3">
                 <input 
                    className="w-full p-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="Название задачи"
                    value={newTask.title}
                    onChange={e => setNewTask({...newTask, title: e.target.value})}
                 />
                 <textarea 
                    className="w-full p-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
                    placeholder="Описание / Текст сообщения / Запрос..."
                    rows={2}
                    value={newTask.description}
                    onChange={e => setNewTask({...newTask, description: e.target.value})}
                 />
                 
                 <div className="grid grid-cols-2 gap-3">
                    <div>
                       <label className="text-xs text-gray-500 ml-1">Тип</label>
                       <select className="w-full p-3 bg-gray-50 border rounded-xl" value={newTask.type} onChange={e => setNewTask({...newTask, type: e.target.value})}>
                          <option value="reminder">Напоминание</option>
                          <option value="email">Email</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="web_search">Поиск в сети</option>
                       </select>
                    </div>
                    <div>
                       <label className="text-xs text-gray-500 ml-1">Повтор</label>
                       <select className="w-full p-3 bg-gray-50 border rounded-xl" value={newTask.frequency} onChange={e => setNewTask({...newTask, frequency: e.target.value})}>
                          <option value="once">Нет</option>
                          <option value="daily">Ежедневно</option>
                          <option value="weekly">Раз в неделю</option>
                          <option value="monthly">Раз в месяц</option>
                       </select>
                    </div>
                 </div>

                 <div>
                    <label className="text-xs text-gray-500 ml-1">Когда</label>
                    <input 
                      type="datetime-local" 
                      className="w-full p-3 bg-gray-50 border rounded-xl"
                      value={newTask.next_run}
                      onChange={e => setNewTask({...newTask, next_run: e.target.value})}
                    />
                 </div>

                 <div className="flex gap-3 pt-4">
                    <button onClick={createTask} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition">Создать</button>
                    <button onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-medium">Отмена</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;