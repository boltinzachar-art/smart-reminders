import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import WebApp from '@twa-dev/sdk';
import { Plus, Calendar, Clock, Trash2, Search, ExternalLink, MoreHorizontal, RefreshCw } from 'lucide-react';

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

  // 1. Инициализация
  useEffect(() => {
    if (WebApp.initDataUnsafe.user) {
      setUserId(WebApp.initDataUnsafe.user.id);
      WebApp.expand();
      WebApp.enableClosingConfirmation();
      // Цвета iOS
      WebApp.setHeaderColor('#F2F2F7'); 
      WebApp.setBackgroundColor('#F2F2F7');
    } else {
      console.log("Browser Test Mode");
      // setUserId(123456); // Раскомментируй для тестов
    }
  }, []);

  // 2. Загрузка
  useEffect(() => {
    if (userId) {
      loadTasks();
    }
  }, [userId]);

  const loadTasks = async () => {
    try {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('telegram_user_id', userId)
        .eq('completed', false) // Загружаем только НЕ выполненные (как в Apple)
        .order('next_run', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading:', error);
    }
  };

  // === ЛОГИКА ===

  const createTask = async () => {
    if (!newTask.title) return alert('Введите название');
    // Если время не указано, ставим "сегодня через час" или просто без времени (для списка)
    // Но для MVP требуем время
    if (!newTask.next_run) return alert('Выберите время');

    let template = null;
    if (newTask.type === 'email') template = { to: "", subject: newTask.title, body: newTask.description };
    if (newTask.type === 'whatsapp') template = { phone: "", message: newTask.title };
    if (newTask.type === 'web_search') template = { query: newTask.title };

    const optimisticTask = {
      ...newTask,
      telegram_user_id: userId,
      status: 'active',
      completed: false,
      action_template: template
    };

    try {
      const { data, error } = await supabase.from('tasks').insert([optimisticTask]).select();
      if (error) throw error;
      if (data) setTasks(prev => [...prev, data[0]]);
      
      setShowAddModal(false);
      setNewTask({ title: '', description: '', type: 'reminder', frequency: 'once', next_run: '', priority: 3 });
    } catch (error) {
      alert('Ошибка: ' + error.message);
    }
  };

  const completeTask = async (task) => {
    // 1. Визуально "кликаем" кружочек
    // Если это одноразовая задача -> она должна исчезнуть из списка
    // Если повторяющаяся -> она должна обновить дату
    
    const isRecurring = task.frequency !== 'once';

    setTasks(current => current.map(t => {
      if (t.id === task.id) {
         if (isRecurring) {
            // Если повтор - просто двигаем дату
            return { ...t, next_run: calculateNextRun(t.next_run, t.frequency) };
         } else {
            // Если один раз - помечаем как completed (она исчезнет при фильтрации, но для анимации пока оставим)
            return { ...t, completed: true };
         }
      }
      return t;
    }));

    // Если задача одноразовая - удаляем её из визуального списка через полсекунды (анимация исчезновения)
    if (!isRecurring) {
        setTimeout(() => {
            setTasks(current => current.filter(t => t.id !== task.id));
        }, 300);
    }

    // 2. Отправляем в базу
    try {
      if (isRecurring) {
        const nextRun = calculateNextRun(task.next_run, task.frequency);
        await supabase.from('tasks').update({ next_run: nextRun }).eq('id', task.id);
      } else {
        await supabase.from('tasks').update({ completed: true, status: 'completed' }).eq('id', task.id);
      }
      // Логируем
      await supabase.from('task_log').insert([{ task_id: task.id, status: 'completed' }]);
    } catch (error) {
      console.error('Ошибка завершения:', error);
      loadTasks(); // Откат при ошибке
    }
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Удалить задачу?')) return;
    setTasks(curr => curr.filter(t => t.id !== taskId));
    await supabase.from('tasks').delete().eq('id', taskId);
  };

  // === ВСПОМОГАТЕЛЬНЫЕ ===

  const calculateNextRun = (currentRun, frequency) => {
    const current = new Date(currentRun);
    if (frequency === 'daily') current.setDate(current.getDate() + 1);
    if (frequency === 'weekly') current.setDate(current.getDate() + 7);
    if (frequency === 'monthly') current.setMonth(current.getMonth() + 1);
    return current.toISOString();
  };

  const performAction = (task) => {
    const text = encodeURIComponent(task.title + (task.description ? `\n${task.description}` : ''));
    if (task.type === 'email') window.open(`mailto:?subject=${encodeURIComponent(task.title)}&body=${text}`);
    if (task.type === 'whatsapp') window.open(`https://wa.me/?text=${text}`);
    if (task.type === 'web_search') window.open(`https://www.google.com/search?q=${encodeURIComponent(task.title)}`);
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    
    // Фильтр поиска
    if (searchQuery) {
      filtered = filtered.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }

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
    // Фон приложения как в iOS (светло-серый)
    <div className="min-h-[100dvh] bg-[#F2F2F7] text-black font-sans flex flex-col">
      
      {/* === ШАПКА === */}
      <div className="px-4 pt-14 pb-2 bg-[#F2F2F7] sticky top-0 z-20">
        <div className="flex justify-between items-end mb-3 px-1">
           <h1 className="text-3xl font-bold text-black tracking-tight">Напоминания</h1>
           {overdueCount > 0 && <span className="text-red-500 font-semibold text-sm bg-white px-2 py-1 rounded-lg shadow-sm">{overdueCount} просрочено</span>}
        </div>

        {/* Поиск в стиле iOS */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-2 text-gray-400" size={18} />
          <input
            className="w-full pl-9 pr-4 py-2 bg-[#E3E3E8] rounded-xl text-base text-black placeholder-gray-500 focus:outline-none focus:bg-white transition-colors"
            placeholder="Поиск"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Фильтры (Табы) */}
        <div className="flex gap-2 pb-2 overflow-x-auto hide-scrollbar">
           {['all', 'today', 'upcoming'].map(f => (
             <button
               key={f}
               onClick={() => setFilter(f)}
               className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === f ? 'bg-black text-white' : 'bg-white text-gray-600 shadow-sm'}`}
             >
               {f === 'all' ? 'Все' : f === 'today' ? 'Сегодня' : 'Будущие'}
             </button>
           ))}
        </div>
      </div>

      {/* === СПИСОК ЗАДАЧ === */}
      <div className="flex-1 px-4 pb-32 space-y-3">
        {filteredList.length === 0 ? (
           <div className="text-center py-20 text-gray-400">
              <p>Нет напоминаний</p>
           </div>
        ) : (
          filteredList.map(task => (
            <div key={task.id} className="group bg-white rounded-xl p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-start gap-3 transition-all active:scale-[0.99]">
               
               {/* === КРУЖОЧЕК (ЧЕКБОКС) === */}
               <button 
                 onClick={() => completeTask(task)}
                 className="mt-1 min-w-[22px] h-[22px] rounded-full border-2 border-gray-300 hover:border-blue-500 focus:outline-none transition-colors flex items-center justify-center"
               >
                 {/* Если бы задача была выполнена, тут была бы заливка, но выполненные мы скрываем */}
               </button>

               {/* ТЕЛО ЗАДАЧИ */}
               <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <span className={`text-[17px] leading-tight ${task.completed ? 'line-through text-gray-400' : 'text-black'}`}>
                      {task.title}
                    </span>
                  </div>

                  {task.description && (
                    <p className="text-gray-500 text-[15px] mt-0.5 line-clamp-2 leading-snug">{task.description}</p>
                  )}

                  {/* Мета-данные (время, иконки) */}
                  <div className="flex items-center gap-2 mt-1.5">
                     <span className={`text-xs font-medium ${isOverdue(task.next_run) ? 'text-red-500' : 'text-gray-400'}`}>
                        {formatTime(task.next_run)}
                     </span>
                     
                     {task.frequency !== 'once' && (
                       <span className="text-gray-400 flex items-center text-xs gap-0.5">
                         <RefreshCw size={10} /> {task.frequency}
                       </span>
                     )}

                     {/* Иконка действия, если есть */}
                     {task.type !== 'reminder' && (
                        <button onClick={(e) => { e.stopPropagation(); performAction(task); }} className="ml-auto text-blue-600 text-xs font-medium flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded">
                           <ExternalLink size={10}/> {task.type}
                        </button>
                     )}
                  </div>
               </div>

               {/* Кнопка удаления (скрытая, или маленькая справа) */}
               <button onClick={() => deleteTask(task.id)} className="text-gray-300 hover:text-red-500 p-1">
                  <Trash2 size={16} />
               </button>
            </div>
          ))
        )}
      </div>

      {/* === КНОПКА СОЗДАНИЯ === */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#F2F2F7]/90 backdrop-blur-md border-t border-gray-200 flex justify-between items-center z-30">
         <button 
           onClick={() => setShowAddModal(true)}
           className="flex items-center gap-2 text-blue-600 font-semibold text-lg active:opacity-70 transition"
         >
            <div className="bg-blue-600 text-white rounded-full p-1">
               <Plus size={20} strokeWidth={3} />
            </div>
            Новое напоминание
         </button>
         <span className="text-blue-600 text-sm font-medium">Добавить список</span>
      </div>

      {/* === МОДАЛКА СОЗДАНИЯ === */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
           <div className="bg-[#F2F2F7] w-full sm:max-w-md rounded-t-2xl p-4 animate-slide-up max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4 px-2">
                 <button onClick={() => setShowAddModal(false)} className="text-blue-600 text-lg">Отмена</button>
                 <h3 className="font-bold text-black text-lg">Новое</h3>
                 <button onClick={createTask} className="text-blue-600 font-bold text-lg disabled:opacity-50">Добавить</button>
              </div>

              <div className="bg-white rounded-xl overflow-hidden mb-4 shadow-sm">
                 <input 
                   className="w-full p-4 bg-white text-lg border-b border-gray-100 focus:outline-none"
                   placeholder="Название"
                   value={newTask.title}
                   onChange={e => setNewTask({...newTask, title: e.target.value})}
                   autoFocus
                 />
                 <textarea 
                   className="w-full p-4 bg-white text-base focus:outline-none resize-none h-24"
                   placeholder="Заметки"
                   value={newTask.description}
                   onChange={e => setNewTask({...newTask, description: e.target.value})}
                 />
              </div>

              <div className="bg-white rounded-xl overflow-hidden shadow-sm space-y-[1px] bg-gray-100">
                 <div className="bg-white p-3 flex justify-between items-center">
                    <span className="text-black">Дата и время</span>
                    <input 
                       type="datetime-local" 
                       className="bg-gray-100 rounded-md p-1 text-sm"
                       value={newTask.next_run}
                       onChange={e => setNewTask({...newTask, next_run: e.target.value})}
                    />
                 </div>
                 <div className="bg-white p-3 flex justify-between items-center">
                    <span className="text-black">Тип действия</span>
                    <select 
                       className="bg-transparent text-blue-600 text-right outline-none"
                       value={newTask.type}
                       onChange={e => setNewTask({...newTask, type: e.target.value})}
                    >
                       <option value="reminder">Нет</option>
                       <option value="email">Email</option>
                       <option value="whatsapp">WhatsApp</option>
                       <option value="web_search">Поиск</option>
                    </select>
                 </div>
                 <div className="bg-white p-3 flex justify-between items-center">
                    <span className="text-black">Повтор</span>
                    <select 
                       className="bg-transparent text-blue-600 text-right outline-none"
                       value={newTask.frequency}
                       onChange={e => setNewTask({...newTask, frequency: e.target.value})}
                    >
                       <option value="once">Никогда</option>
                       <option value="daily">Ежедневно</option>
                       <option value="weekly">Еженедельно</option>
                       <option value="monthly">Ежемесячно</option>
                    </select>
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